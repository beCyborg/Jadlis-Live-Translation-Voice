<script lang="ts">
  import { conversation } from './conversation.svelte';
  import Icon from './Icon.svelte';

  const label = $derived(
    conversation.finishing ? 'Перевожу…' : conversation.talking ? 'Перевести' : 'Говорить',
  );
  const hint = $derived(
    conversation.talking
      ? 'Слушаю. Нажмите ещё раз, когда закончите.'
      : conversation.status === 'off'
        ? 'Нажмите и говорите. Нажмите ещё раз — переведу.'
        : '',
  );
</script>

<div class="talk">
  <button
    class="ptt"
    class:on={conversation.talking}
    disabled={conversation.finishing || conversation.status === 'starting'}
    onclick={() => conversation.toggleTalk()}
    aria-pressed={conversation.talking}
  >
    <Icon name={conversation.talking ? 'send' : 'mic'} />
    <span>{label}</span>
  </button>
  {#if hint}<p>{hint}</p>{/if}
</div>

<style>
  .talk {
    flex: none;
    padding: 10px 20px calc(14px + env(safe-area-inset-bottom));
    text-align: center;
    background: var(--bg);
  }
  .ptt {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    max-width: 420px;
    padding: 16px 20px;
    border-radius: var(--radius);
    background: var(--bg-2);
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
    transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
  }
  .ptt :global(svg) { width: 22px; height: 22px; }
  .ptt.on { background: var(--accent); color: #fff; animation: pulse 1.6s ease-in-out infinite; }
  .ptt:active { transform: scale(0.98); }
  .ptt:disabled { opacity: 0.5; }
  p { margin: 8px 8px 0; color: var(--text-2); font-size: 14px; line-height: 1.35; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 6px var(--accent-soft); } }
</style>
