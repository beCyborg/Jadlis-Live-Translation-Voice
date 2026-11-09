<script lang="ts">
  import { settings, keys, presetVoice, type Model } from './settings.svelte';
  import { conversation } from './conversation.svelte';
  import { LANGS, PRESETS, type Lang } from './langs';
  import Icon from './Icon.svelte';

  let { open = $bindable(false) }: { open: boolean } = $props();

  interface Voice { voice_id: string; name: string }
  let voices: Voice[] = $state([]);
  let voicesError = $state('');

  $effect(() => {
    if (open && !voices.length && keys.eleven) void loadVoices();
  });

  async function loadVoices() {
    voicesError = '';
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': keys.eleven } });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { voices: Voice[] };
      voices = j.voices.map((v) => ({ voice_id: v.voice_id, name: v.name.split(' - ')[0] }));
    } catch {
      voicesError = 'Не удалось загрузить голоса: у ключа может не быть права «Voices — read».';
    }
  }

  const genders = $derived({
    male: presetVoice(settings.foreign, 'male').name,
    female: presetVoice(settings.foreign, 'female').name,
  });

  function setCustom(l: Lang, id: string) {
    if (id) settings.voiceCustom[l] = id;
    else delete settings.voiceCustom[l];
  }

  const shownLangs = $derived<Lang[]>([settings.foreign, 'ru']);
  const models: { id: Model; label: string }[] = [
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  ];

  function clearHistory() {
    if (confirm('Удалить всю историю разговоров с этого телефона?')) conversation.clearHistory();
  }
</script>

{#if open}
  <div class="scrim" onclick={() => (open = false)} role="presentation"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Настройки">
    <header>
      <h2>Настройки</h2>
      <button class="icon-btn" onclick={() => (open = false)} aria-label="Закрыть"><Icon name="close" /></button>
    </header>
    <div class="scroll">
      <p class="group-title">Язык собеседника</p>
      <div class="group">
        <div class="row">
          <div class="segmented langs" style="flex:1">
            {#each PRESETS as f}
              <button class:active={settings.foreign === f} onclick={() => (settings.foreign = f)}>{LANGS[f].flag} {LANGS[f].name}</button>
            {/each}
          </div>
        </div>
        <div class="row">
          <span class="label">Вежливое обращение</span>
          <label class="switch"><input type="checkbox" bind:checked={settings.polite} /><span></span></label>
        </div>
        {#if settings.foreign === 'es'}
          <div class="row">
            <span class="label">Испанский</span>
            <div class="segmented">
              <button class:active={settings.esVariant === 'spain'} onclick={() => (settings.esVariant = 'spain')}>Испания</button>
              <button class:active={settings.esVariant === 'latam'} onclick={() => (settings.esVariant = 'latam')}>Лат. Америка</button>
            </div>
          </div>
        {/if}
      </div>
      <p class="group-foot">{settings.polite ? 'Pan/Pani, usted, vykání, could you.' : 'На «ты»: ty, tú, tykání.'}</p>

      <p class="group-title">Озвучка</p>
      <div class="group">
        <div class="row">
          <span class="label">Озвучивать сам</span>
          <label class="switch"><input type="checkbox" bind:checked={settings.autoSpeak} /><span></span></label>
        </div>
        <div class="row">
          <span class="label">Темп</span>
          <input type="range" min="0.8" max="1.5" step="0.05" bind:value={settings.rate} />
          <span class="value num">×{settings.rate.toFixed(2)}</span>
        </div>
        <div class="row">
          <span class="label">Голос · {LANGS[settings.foreign].name.toLowerCase()}</span>
          <div class="segmented">
            <button class:active={settings.voiceGender === 'male'} onclick={() => (settings.voiceGender = 'male')}>{genders.male}</button>
            <button class:active={settings.voiceGender === 'female'} onclick={() => (settings.voiceGender = 'female')}>{genders.female}</button>
          </div>
        </div>
        {#each shownLangs as l}
          <div class="row">
            <span class="label">{l === 'ru' ? 'Голос · русский' : 'Свой голос из библиотеки'}</span>
            <select value={settings.voiceCustom[l] ?? ''} onchange={(e) => setCustom(l, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">{l === 'ru' ? presetVoice('ru').name : 'Нет'}</option>
              {#each voices as v (v.voice_id)}
                <option value={v.voice_id}>{v.name}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
      {#if voicesError}<p class="group-foot">{voicesError}</p>{/if}

      <p class="group-title">Распознавание</p>
      <div class="group">
        <div class="row">
          <span class="label">Пауза до перевода</span>
          <input type="range" min="0.3" max="2" step="0.1" bind:value={settings.vadSilence} />
          <span class="value num">{settings.vadSilence.toFixed(1)} с</span>
        </div>
        <div class="row col">
          <span class="label">Ключевые термины</span>
          <textarea bind:value={settings.keyterms} placeholder={'Имена, улицы, названия — по одному в строке'} rows="3"></textarea>
        </div>
      </div>
      <p class="group-foot">Короче пауза — быстрее перевод, но фраза может оборваться. Каждый термин немного дорожает распознавание; держите список коротким.</p>

      <p class="group-title">Перевод</p>
      <div class="group">
        <div class="row">
          <span class="label">Модель</span>
          <div class="segmented">
            {#each models as m}
              <button class:active={settings.model === m.id} onclick={() => (settings.model = m.id)}>{m.label}</button>
            {/each}
          </div>
        </div>
        <div class="row col">
          <span class="label">Свой промпт</span>
          <textarea bind:value={settings.customPrompt} placeholder="Например: я врач, разговор о симптомах; переводи медицинские термины точно." rows="3"></textarea>
        </div>
      </div>
      <p class="group-foot">Sonnet точнее определяет, кто говорит. Haiku дешевле, но чаще ошибается на коротких словах.</p>

      <p class="group-title">Экран</p>
      <div class="group">
        <div class="row">
          <div class="segmented" style="flex:1">
            <button class:active={settings.layout === 'split'} onclick={() => (settings.layout = 'split')}>Две половины</button>
            <button class:active={settings.layout === 'single'} onclick={() => (settings.layout = 'single')}>Одна колонка</button>
          </div>
        </div>
      </div>

      <p class="group-title">Ключи</p>
      <div class="group">
        <div class="row">
          <span class="label">Anthropic</span>
          <input type="password" bind:value={settings.anthropicKey} placeholder={keys.hasDemo ? 'демо-ключ' : 'sk-ant-…'} autocomplete="off" spellcheck="false" />
        </div>
        <div class="row">
          <span class="label">ElevenLabs</span>
          <input type="password" bind:value={settings.elevenKey} placeholder={keys.hasDemo ? 'демо-ключ' : 'sk_…'} autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <p class="group-foot">
        {#if keys.usingDemo}Сейчас работают демо-ключи с лимитом. Вставьте свои, чтобы платить самим и не упираться в лимит.{/if}
        Ключи хранятся только в этом браузере. Сайт отправляет их только в Anthropic и ElevenLabs.
      </p>

      <p class="group-title">История</p>
      <div class="group">
        <button class="row danger" onclick={clearHistory} disabled={!conversation.turns.length}>
          Очистить историю ({conversation.turns.length})
        </button>
      </div>

      <p class="group-title">Отладка</p>
      <div class="group">
        <div class="row">
          <span class="label">Показывать замеры</span>
          <label class="switch"><input type="checkbox" bind:checked={settings.debug} /><span></span></label>
        </div>
        <div class="row">
          <span class="label">Глушить микрофон во время озвучки</span>
          <label class="switch"><input type="checkbox" bind:checked={settings.muteWhileSpeaking} /><span></span></label>
        </div>
        <div class="row">
          <span class="label">Звук iOS</span>
          <select bind:value={settings.audioSession}>
            <option value="auto">Авто</option>
            <option value="play-and-record">Разговор</option>
            <option value="playback">Громко</option>
          </select>
        </div>
        {#if settings.debug}
          <div class="row col">
            <table>
              <thead><tr><th>#</th><th>фраза</th><th>1-е слово</th><th>звук</th><th>кэш</th></tr></thead>
              <tbody>
                {#each [...conversation.timings].reverse() as t (t.id)}
                  <tr>
                    <td>{t.id}</td>
                    <td>~{t.commitMs}</td>
                    <td>{t.firstTokenMs ?? '—'}</td>
                    <td>{t.firstAudioMs ?? '—'}</td>
                    <td>{t.cacheRead ?? '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
      <p class="group-foot">Миллисекунды. «Фраза» — от конца речи до готового текста (оценка), остальное — от готового текста. «Звук iOS» меняйте, если перевод слишком тихий или идёт в разговорный динамик. Глушение микрофона помогает, если телефон переводит сам себя.</p>
      <p class="group-foot version">Jadlis Live Translation Voice</p>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.32); z-index: 30; animation: fade 0.2s ease; }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 92dvh;
    z-index: 31;
    background: var(--sheet);
    border-radius: 14px 14px 0 0;
    display: flex;
    flex-direction: column;
    animation: up 0.32s cubic-bezier(0.2, 0.9, 0.2, 1);
    max-width: 640px;
    margin: 0 auto;
  }
  header { display: flex; align-items: center; padding: 14px 16px 6px 20px; }
  h2 { flex: 1; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .scroll { overflow-y: auto; padding: 0 16px calc(24px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch; }
  .row.col { flex-direction: column; align-items: stretch; gap: 6px; }
  .row .segmented button { white-space: nowrap; }
  .num { min-width: 52px; text-align: right; font-variant-numeric: tabular-nums; }
  .danger { color: var(--danger); width: 100%; font-size: 17px; text-align: left; }
  .danger:disabled { opacity: 0.4; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 3px 4px; }
  th { color: var(--text-2); font-weight: 500; }
  .version { text-align: center; margin-top: 18px; color: var(--text-3); }
  @keyframes up { from { transform: translateY(100%); } }
  @keyframes fade { from { opacity: 0; } }
</style>
