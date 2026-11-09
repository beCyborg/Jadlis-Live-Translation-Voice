<script lang="ts">
  import Anthropic from '@anthropic-ai/sdk';
  import { settings } from './settings.svelte';
  import { LANGS, PRESETS } from './langs';

  let { done }: { done: () => void } = $props();

  let anthropic = $state(settings.anthropicKey);
  let eleven = $state(settings.elevenKey);
  let checking = $state(false);
  let error = $state('');

  async function save() {
    error = '';
    checking = true;
    try {
      const a = anthropic.trim();
      const e = eleven.trim();
      const client = new Anthropic({ apiKey: a, dangerouslyAllowBrowser: true, maxRetries: 0 });
      const [ra, re] = await Promise.allSettled([
        client.models.retrieve(settings.model),
        fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': e } }),
      ]);
      if (ra.status === 'rejected') {
        const err = ra.reason;
        error = err instanceof Anthropic.AuthenticationError ? 'Ключ Anthropic не подошёл.' : err instanceof Anthropic.APIConnectionError ? 'Нет связи с Anthropic.' : 'Anthropic не принял ключ.';
        return;
      }
      if (re.status === 'rejected') { error = 'Нет связи с ElevenLabs.'; return; }
      if (!re.value.ok) {
        error = re.value.status === 401 ? 'Ключ ElevenLabs не подошёл или у него нет права на распознавание речи.' : `ElevenLabs ответил ошибкой ${re.value.status}.`;
        return;
      }
      settings.anthropicKey = a;
      settings.elevenKey = e;
      done();
    } finally {
      checking = false;
    }
  }
</script>

<main class="setup">
  <h1>Живой перевод</h1>
  <p class="lead">Положите телефон между собой и собеседником. Каждый говорит на своём языке, телефон показывает и озвучивает перевод.</p>

  <p class="group-title">Язык собеседника</p>
  <div class="group">
    <div class="row">
      <div class="segmented langs" style="flex:1">
        {#each PRESETS as f}
          <button class:active={settings.foreign === f} onclick={() => (settings.foreign = f)}>{LANGS[f].flag} {LANGS[f].name}</button>
        {/each}
      </div>
    </div>
  </div>

  <p class="group-title">Ваши ключи</p>
  <div class="group">
    <div class="row">
      <span class="label">Anthropic</span>
      <input type="password" bind:value={anthropic} placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />
    </div>
    <div class="row">
      <span class="label">ElevenLabs</span>
      <input type="password" bind:value={eleven} placeholder="sk_…" autocomplete="off" spellcheck="false" />
    </div>
  </div>
  <p class="group-foot">
    Ключ Claude — <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.
    Ключ ElevenLabs — <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener">elevenlabs.io</a>, с правами на распознавание речи, озвучку и чтение голосов.
    Ключи остаются только в этом браузере, сервера у сайта нет.
  </p>

  {#if error}<p class="err">{error}</p>{/if}
  <button class="primary" onclick={save} disabled={checking || !anthropic.trim() || !eleven.trim()}>
    {checking ? 'Проверяю ключи…' : 'Сохранить'}
  </button>
</main>

<style>
  .setup {
    max-width: 520px;
    margin: 0 auto;
    padding: calc(40px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom));
    min-height: 100dvh;
    background: var(--sheet);
  }
  h1 { font-size: 34px; font-weight: 700; letter-spacing: -0.025em; margin: 0 4px 8px; }
  .lead { font-size: 17px; line-height: 1.4; color: var(--text-2); margin: 0 4px 10px; }
  .group-foot a { color: var(--accent); text-decoration: none; }
  .err { color: var(--danger); margin: 14px 4px 0; font-size: 15px; }
  .primary { margin-top: 22px; }
</style>
