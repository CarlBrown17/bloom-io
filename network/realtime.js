// ============================================================
// REALTIME — multiplayer over Supabase Realtime channels.
//
// Architecture:
//   - One shared channel ('bloom-arena') with PRESENCE (who's online)
//     and BROADCAST (position snapshots at 10Hz).
//   - Positions never touch the database → fast and free-tier safe.
//   - Remote players are interpolated toward their latest snapshot
//     so movement looks smooth instead of teleporting.
//   - 'kill' events tell a client it was absorbed by someone bigger.
// ============================================================
import { CONFIG } from '../config.js';
import { getClient } from './supabase.js';
import { Player } from '../objects/Player.js';
import { toast, dlog } from '../main.js';

export class Network {
  /** @param {Phaser.Scene} scene the GameScene */
  constructor(scene) {
    this.scene = scene;
    this.channel = null;
    this.connected = false;
    this.lastBroadcast = 0;
    this.latency = 0;
    this.pendingQueue = [];          // snapshots queued while disconnected
    this._interpTimer = null;
  }

  connect() {
    let sb;
    try { sb = getClient(); } catch { return; }   // offline mode: silently skip

    this.channel = sb.channel('bloom-arena', {
      config: { presence: { key: this.scene.player.id }, broadcast: { self: false } },
    });

    // ---- Position snapshots from other players ----
    this.channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
      this.onRemoteSnapshot(payload);
    });

    // ---- Kill events: someone absorbed us ----
    this.channel.on('broadcast', { event: 'kill' }, ({ payload }) => {
      if (payload.victimId === this.scene.player.id && !this.scene.isDead) {
        this.scene.handleDeath(payload.killerName || 'another organism');
      }
    });

    // ---- Presence: clean up players who left ----
    this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      for (const p of leftPresences) this.removeRemote(p.key ?? p.id);
    });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.connected = true;
        await this.channel.track({ id: this.scene.player.id, joined: Date.now() });
        // Flush anything queued while we were offline
        this.pendingQueue.forEach((snap) => this.send('pos', snap));
        this.pendingQueue = [];
        toast('Connected to the arena 🌊');
        dlog('realtime subscribed');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.connected = false;
        toast('Reconnecting…', 4000);
        // Supabase client auto-reconnects; resubscribe defensively after 3s
        setTimeout(() => { if (!this.connected) this.reconnect(); }, 3000);
      }
    });

    // Smooth interpolation loop for remote players (runs every frame via scene events)
    this.scene.events.on('update', () => this.interpolateRemotes());

    // Clean disconnect on tab close
    window.addEventListener('beforeunload', () => {
      try { this.channel?.untrack(); this.channel?.unsubscribe(); } catch { /* best effort */ }
    });
  }

  reconnect() {
    try { this.channel?.unsubscribe(); } catch { /* ignore */ }
    this.channel = null;
    this.connect();
  }

  /** Throttled broadcast of our own state (10x/sec). */
  maybeBroadcast(player) {
    const now = Date.now();
    if (now - this.lastBroadcast < CONFIG.NETWORK_UPDATE_RATE) return;
    this.lastBroadcast = now;
    const snap = player.serialize();
    snap.ts = now;   // timestamp for latency estimation
    if (this.connected) this.send('pos', snap);
    else if (this.pendingQueue.length < 20) this.pendingQueue.push(snap);
  }

  send(event, payload) {
    try { this.channel?.send({ type: 'broadcast', event, payload }); }
    catch (e) { dlog('send failed', e); }
  }

  /** Tell a victim's client it has been absorbed. */
  broadcastKill(victimId) {
    this.send('kill', { victimId, killerName: this.scene.player.username });
  }

  /** Create/update the sprite for a remote player from a snapshot. */
  onRemoteSnapshot(d) {
    if (!d || d.id === this.scene.player.id) return;
    this.latency = d.ts ? Math.max(0, Date.now() - d.ts) : this.latency;

    let rp = this.scene.remotePlayers.get(d.id);
    if (!rp) {
      // Cull: cap how many remote organisms we render
      if (this.scene.remotePlayers.size >= CONFIG.MAX_VISIBLE_PLAYERS && !this.scene.debugMode) return;
      rp = new Player(this.scene, {
        id: d.id, username: d.u, x: d.x, y: d.y,
        color: { r: d.c[0], g: d.c[1], b: d.c[2] },
        biomass: d.b, territory: d.t, isLocal: false, cosmetic: d.cos,
      });
      this.scene.remotePlayers.set(d.id, rp);
      dlog('remote joined:', d.u);
    }
    rp.deserialize(d);
    // Store the network target; interpolateRemotes() eases toward it each frame
    rp._netX = d.x;
    rp._netY = d.y;
    rp._lastSeen = Date.now();
  }

  /** Ease every remote player toward its latest network position. */
  interpolateRemotes() {
    const now = Date.now();
    for (const [id, rp] of this.scene.remotePlayers) {
      if (rp._netX !== undefined) {
        rp.x += (rp._netX - rp.x) * CONFIG.INTERPOLATION_FACTOR;
        rp.y += (rp._netY - rp.y) * CONFIG.INTERPOLATION_FACTOR;
        rp.redraw();
      }
      // Drop ghosts: no snapshot in 5s means they left or crashed
      if (rp._lastSeen && now - rp._lastSeen > 5000) this.removeRemote(id);
    }
  }

  removeRemote(id) {
    const rp = this.scene.remotePlayers.get(id);
    if (rp) {
      rp.destroy();
      this.scene.remotePlayers.delete(id);
      dlog('remote left:', id);
    }
  }
}
