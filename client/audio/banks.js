// The procedural banks: rendering them (synth workers, with the main thread as the fallback) and keeping the results.
// Mixed onto AudioEngine's prototype (audio.js), so the state stays on the engine: _queue (the render jobs and the
// workers), _banks (bank -> buffers by variant index), _pools (bank -> the loaded buffers) and _waiters.
import { renderJob } from './registry.js';

// hands the event loop a turn between main-thread renders (a MessageChannel round trip, without setTimeout's clamp)
const yieldNow = (() => {
  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel();
    const q = [];
    ch.port1.onmessage = () => q.shift()?.();
    return () => new Promise((r) => {
      q.push(r);
      ch.port2.postMessage(0);
    });
  }
  return () => new Promise((r) => setTimeout(r, 0));
})();

export const bankMethods = {
  _store(bank, i, chans, sr) {
    const c = this._ctx;
    const buf = c.createBuffer(chans.length, chans[0].length, sr);
    for (let k = 0; k < chans.length; k++) {
      if (buf.copyToChannel) buf.copyToChannel(chans[k], k);
      else buf.getChannelData(k).set(chans[k]);
    }
    if (bank === 'ir_forest' || bank === 'ir_open' || bank === 'ir_room') {
      this._envs[bank.slice(3)].conv.buffer = buf;
      return;
    }
    if (bank === 'ir_hall') {
      this._hallIR = buf;
      if (this._music) this._music.setIR(buf);
      return;
    }
    let arr = this._banks.get(bank);
    if (!arr) {
      arr = [];
      this._banks.set(bank, arr);
      this._pools.set(bank, []);
    }
    arr[i] = buf;
    this._pools.get(bank).push(buf);
    const w = this._waiters.get(bank);
    if (w) {
      this._waiters.delete(bank);
      for (const fn of w) {
        try {
          fn();
        } catch (err) {
          console.warn('[audio]', err);
        }
      }
    }
  },

  _spawnWorkers() {
    const q = this._queue;
    if (q.triedWorkers) return;
    q.triedWorkers = true;
    if (typeof Worker === 'undefined') return;
    const n = Math.max(1, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 1));
    for (let k = 0; k < n; k++) {
      let w;
      try {
        w = new Worker(new URL('./synth-worker.js', import.meta.url), { type: 'module' });
      } catch {
        break;
      }
      const rec = { w, busy: 0, dead: false };
      w.onmessage = (ev) => this._onWorkerMsg(rec, ev.data);
      w.onerror = (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        this._killWorker(rec, 'error ' + (ev && ev.message));
      };
      q.workers.push(rec);
    }
  },

  _killWorker(rec, why) {
    if (rec.dead) return;
    rec.dead = true;
    try {
      rec.w.terminate();
    } catch {}
    console.warn('[audio] synth worker failed, falling back to main thread:', why);
    const q = this._queue;
    // requeue its in-flight jobs
    for (const [id, job] of q.inflight) {
      if (job.rec === rec) {
        q.inflight.delete(id);
        q.jobs.unshift(job);
      }
    }
    this._pump();
  },

  _onWorkerMsg(rec, msg) {
    const q = this._queue;
    const job = q.inflight.get(msg.id);
    if (!job) return;
    q.inflight.delete(msg.id);
    rec.busy--;
    rec.ok = true;
    if (msg.error) console.warn('[audio] render failed', job.bank, msg.error);
    else {
      try {
        this._store(job.bank, job.i, msg.chans, msg.sr);
      } catch (err) {
        console.warn('[audio] buffer creation failed', job.bank, err);
      }
    }
    this._pump();
  },

  _pump() {
    const q = this._queue;
    const live = q.workers.filter((r) => !r.dead);
    if (!live.length) {
      if (!q.mainLoop && q.jobs.length) this._mainThreadLoop();
      this._checkDone();
      return;
    }
    for (const rec of live) {
      while (rec.busy < 2 && q.jobs.length) {
        const job = q.jobs.shift();
        const id = ++q.seq;
        job.rec = rec;
        q.inflight.set(id, job);
        rec.busy++;
        rec.w.postMessage({ id, bank: job.bank, i: job.i, ctxRate: this._ctx.sampleRate });
      }
    }
    this._checkDone();
  },

  // render one job here on the main thread and store it (throws if the render fails)
  _renderHere(job) {
    const r = renderJob(job.bank, job.i, this._ctx.sampleRate);
    this._store(job.bank, job.i, r.chans, r.sr);
  },

  async _mainThreadLoop() {
    const q = this._queue;
    q.mainLoop = true;
    let last = performance.now();
    while (q.jobs.length) {
      const job = q.jobs.shift();
      try {
        this._renderHere(job);
      } catch (err) {
        console.warn('[audio] render failed', job.bank, err);
      }
      if (performance.now() - last > 12) {
        await yieldNow();
        last = performance.now();
      }
    }
    q.mainLoop = false;
    this._checkDone();
  },

  _checkDone() {
    const q = this._queue;
    if (q.done && !q.jobs.length && !q.inflight.size && !q.mainLoop) {
      const d = q.done;
      q.done = null;
      d();
    }
  },

  // render the current job list (core first; `late` moves the background list in)
  _renderJobs(core) {
    const q = this._queue;
    if (!core) {
      q.jobs.push(...q.late);
      q.late = [];
    }
    return new Promise((resolve) => {
      q.done = resolve;
      this._spawnWorkers();
      // watchdog: if workers never answer (e.g. module workers unsupported), fall back to the main thread
      if (core && q.workers.length) {
        setTimeout(() => {
          if (q.done === resolve && !q.workers.some((r) => r.ok)) {
            for (const r of q.workers) this._killWorker(r, 'timeout');
          }
        }, 4000);
      }
      this._pump();
    });
  },

  _finishWorkers() {
    for (const r of this._queue.workers) {
      if (!r.dead) {
        r.dead = true;
        try {
          r.w.terminate();
        } catch {}
      }
    }
  },

  // make sure a bank gets rendered soon; cb runs when available (immediately if already loaded)
  _need(bank, cb) {
    if (this._pools.get(bank)?.length) {
      if (cb) cb();
      return;
    }
    if (cb) {
      let w = this._waiters.get(bank);
      if (!w) this._waiters.set(bank, (w = []));
      w.push(cb);
    }
    const q = this._queue;
    if (!q) return;
    const move = (list) => {
      for (let k = list.length - 1; k >= 0; k--) {
        if (list[k].bank === bank) {
          const [j] = list.splice(k, 1);
          q.jobs.unshift(j);
        }
      }
    };
    move(q.jobs);
    move(q.late);
    if (!q.finished && q.done && q.jobs.length) this._pump();
    else if (q.finished && q.jobs.length) {
      // background rendering already finished: render synchronously (rare)
      const jobs = q.jobs.splice(0);
      for (const j of jobs) {
        try {
          this._renderHere(j);
        } catch {}
      }
    }
  },

  _pick(bank, variant) {
    const arr = this._banks.get(bank);
    if (!arr) return null;
    if (variant !== undefined && variant !== null && arr.length) {
      const b = arr[((variant | 0) % arr.length + arr.length) % arr.length];
      if (b) return b;
    }
    const pool = this._pools.get(bank);
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    // avoid immediate repeats
    const last = this._lastVariant.get(bank);
    let k = Math.floor(Math.random() * pool.length);
    if (k === last) k = (k + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    this._lastVariant.set(bank, k);
    return pool[k];
  },
};
