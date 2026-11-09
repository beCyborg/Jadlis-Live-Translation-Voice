// One getUserMedia for the whole conversation; the worklet turns it into 16 kHz PCM frames.
export class Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  constructor(private onFrame: (pcm: Int16Array) => void) {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'pcm16k', { processorOptions: { inRate: this.ctx.sampleRate } });
    this.node.port.onmessage = (e) => this.onFrame(new Int16Array(e.data as ArrayBuffer));
    // Keep the node pulled by the graph without making any sound.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    src.connect(this.node).connect(sink).connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async resume() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node?.disconnect();
    void this.ctx?.close();
    this.ctx = null; this.stream = null; this.node = null;
  }
}
