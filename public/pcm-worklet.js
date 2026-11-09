// Downsamples mono mic input to 16 kHz Int16 PCM and posts 50 ms frames (800 samples).
class Pcm16k extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = options.processorOptions.inRate / 16000;
    this.pos = 0; this.acc = 0; this.cnt = 0;
    this.out = new Int16Array(800); this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = this.acc / this.cnt; this.acc = 0; this.cnt = 0;
        this.out[this.n++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
        if (this.n === this.out.length) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(800); this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm16k', Pcm16k);
