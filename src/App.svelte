<script lang="ts">
  import { settings, keys } from './lib/settings.svelte';
  import { conversation } from './lib/conversation.svelte';
  import { LANGS } from './lib/langs';
  import Half from './lib/Half.svelte';
  import Single from './lib/Single.svelte';
  import SettingsSheet from './lib/SettingsSheet.svelte';
  import Setup from './lib/Setup.svelte';
  import Icon from './lib/Icon.svelte';

  let ready = $state(!!keys.anthropic && !!keys.eleven);
  let sheet = $state(false);
  const on = $derived(conversation.status !== 'off');
</script>

{#if !ready}
  <Setup done={() => (ready = true)} />
{:else}
  <main class="screen" class:single={settings.layout === 'single'}>
    {#if settings.layout === 'split'}
      <Half side="them" flipped />
    {/if}

    <div class="bar">
      <button class="icon-btn" onclick={() => (sheet = true)} aria-label="Настройки"><Icon name="gear" /></button>
      <button class="pair" onclick={() => (sheet = true)}>
        {LANGS.ru.flag} RU <span class="arrows">⇄</span> {settings.foreign.toUpperCase()} {LANGS[settings.foreign].flag}
      </button>
      {#if on}
        <button class="icon-btn" onclick={() => conversation.stop()} aria-label="Закончить разговор"><Icon name="stop" /></button>
      {:else}
        <span class="icon-btn ghost"></span>
      {/if}
    </div>

    {#if settings.layout === 'split'}
      <Half side="me" />
    {:else}
      <Single />
    {/if}

    {#if !on}
      <div class="start">
        <button class="primary" onclick={() => conversation.start()}>Начать разговор</button>
        <p>Телефон попросит доступ к микрофону. Экран не погаснет, пока идёт разговор.</p>
      </div>
    {/if}

    {#if !conversation.online}
      <div class="banner error"><p>Нет сети. Перевод продолжится, когда связь вернётся.</p></div>
    {:else if conversation.error}
      <div class="banner error">
        <p>{conversation.error}</p>
        <button class="icon-btn" onclick={() => (conversation.error = null)} aria-label="Скрыть"><Icon name="close" /></button>
      </div>
    {:else if conversation.notice}
      <div class="banner notice">
        <p>{conversation.notice}</p>
        <button class="icon-btn" onclick={() => (conversation.notice = null)} aria-label="Скрыть"><Icon name="close" /></button>
      </div>
    {/if}
  </main>
  <SettingsSheet bind:open={sheet} />
{/if}

<style>
  .screen {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    max-width: 820px;
    margin: 0 auto;
    position: relative;
  }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    border-top: 0.5px solid var(--sep);
    border-bottom: 0.5px solid var(--sep);
    background: var(--bg);
  }
  .screen.single .bar { border-top: 0; padding-top: calc(6px + env(safe-area-inset-top)); }
  .pair { font-size: 14px; font-weight: 600; color: var(--text-2); letter-spacing: 0.01em; padding: 6px 10px; border-radius: 8px; }
  .pair .arrows { color: var(--accent); margin: 0 4px; }
  .ghost { visibility: hidden; }
  .start {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 20px 20px calc(24px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, var(--bg) 70%, transparent);
    text-align: center;
  }
  .start p { margin: 12px 8px 0; color: var(--text-2); font-size: 14px; line-height: 1.35; }
</style>
