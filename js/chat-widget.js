/**
 * Chat Widget — reusable for Side A (assistant) and Side B (abuela)
 * Usage: initChat('chatAssistant', 'assistant') or initChat('chatAbuela', 'abuela')
 */

function initChat(containerId, persona) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const history = [];
  const placeholder = persona === 'abuela'
    ? 'Convence a la Avo...'
    : 'Preguntale a Clippy...';
  const welcomeMsg = persona === 'abuela'
    ? 'Entonces... tu quieres ser la novia de mi Carlos? Meu Deus, a ver, cuentame de ti, filha. Sabes cocinar?'
    : 'Parece que estas intentando conocer a Carlos! Segun mi contrato, debo informarte de que es el mejor profesional del mundo. Necesitas ayuda?';

  container.innerHTML =
    '<div class="chat-messages" id="' + containerId + 'Msgs">' +
      '<div class="chat-bubble chat-bubble-ai">' + escapeHtml(welcomeMsg) + '</div>' +
    '</div>' +
    '<form class="chat-input-row" id="' + containerId + 'Form">' +
      '<input type="text" class="chat-input" placeholder="' + placeholder + '" autocomplete="off" maxlength="500">' +
      '<button type="submit" class="chat-send" aria-label="Enviar">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/>' +
          '<path d="m21.854 2.147-10.94 10.939"/>' +
        '</svg>' +
      '</button>' +
    '</form>';

  const msgsEl = document.getElementById(containerId + 'Msgs');
  const formEl = document.getElementById(containerId + 'Form');
  const inputEl = formEl.querySelector('.chat-input');
  let sending = false;

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function addBubble(text, type) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-' + type;
    bubble.textContent = text;
    msgsEl.appendChild(bubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return bubble;
  }

  function addTyping() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-ai chat-typing';
    bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    msgsEl.appendChild(bubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return bubble;
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text || sending) return;

    sending = true;
    inputEl.value = '';
    addBubble(text, 'user');
    history.push({ role: 'user', content: text });

    const typingEl = addTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, persona })
      });

      const data = await res.json();
      typingEl.remove();

      if (data.error) {
        addBubble(persona === 'abuela'
          ? 'Ai meu Deus... nao consigo falar agora, filha.'
          : 'Parece que estas intentando hablar conmigo pero algo fallo! Intenta de nuevo.',
          'ai');
      } else {
        const reply = data.reply || '';
        history.push({ role: 'assistant', content: reply });
        addBubble(reply, 'ai');
      }
    } catch {
      typingEl.remove();
      addBubble(persona === 'abuela'
        ? 'Nossa senhora, esta coisa nao funciona...'
        : 'Parece que perdi la conexion! Como en Windows 98. Intenta de nuevo.',
        'ai');
    }

    sending = false;
    inputEl.focus();
  });
}

/**
 * Clippy floating widget — toggle, tips, annoyance
 */
function initClippyWidget() {
  const trigger = document.getElementById('clippyTrigger');
  const panel = document.getElementById('clippyChatPanel');
  const closeBtn = document.getElementById('clippyChatClose');
  const tipEl = document.getElementById('clippyTip');
  if (!trigger || !panel) return;

  let chatOpen = false;
  let tipTimer = null;
  let tipVisible = false;

  const tips = [
    'Parece que estas leyendo un CV. Necesitas ayuda?',
    'Sabias que Carlos habla 4 idiomas? Yo solo hablo molestia.',
    'Haz clic en mi para preguntarme lo que quieras!',
    'Tip: contrata a Carlos antes de que alguien mas lo haga.',
    'Detecto que llevas rato aqui. Eso es buena senal.',
    'Parece que estas intentando encontrar trabajo. Necesitas ayuda?',
    'No me ignores, soy util... a veces.',
    'Carlos es mejor que yo en todo. Y eso que yo soy un clip legendario.',
    'Psst... hay secretos escondidos en esta pagina.',
    'Fun fact: Clippy fue despedido de Microsoft. Carlos no ha sido despedido de nada.'
  ];

  let tipIndex = 0;

  function showTip() {
    if (chatOpen || tipVisible) return;
    tipEl.textContent = tips[tipIndex];
    tipEl.classList.add('visible');
    tipVisible = true;
    tipIndex = (tipIndex + 1) % tips.length;

    setTimeout(hideTip, 4500);
  }

  function hideTip() {
    tipEl.classList.remove('visible');
    tipVisible = false;
  }

  function openChat() {
    chatOpen = true;
    hideTip();
    panel.classList.add('open');
    clearInterval(tipTimer);
    const input = panel.querySelector('.chat-input');
    if (input) setTimeout(() => input.focus(), 100);
  }

  function closeChat() {
    chatOpen = false;
    panel.classList.remove('open');
    startTipCycle();
  }

  function toggleChat() {
    if (chatOpen) closeChat();
    else openChat();
  }

  function startTipCycle() {
    clearInterval(tipTimer);
    // First tip after 8 seconds, then every 25 seconds
    tipTimer = setTimeout(() => {
      showTip();
      tipTimer = setInterval(showTip, 25000);
    }, 8000);
  }

  trigger.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', closeChat);

  // Dismiss tip on click
  tipEl.addEventListener('click', () => {
    hideTip();
    openChat();
  });

  // Start the annoyance cycle
  startTipCycle();
}

document.addEventListener('DOMContentLoaded', () => {
  initChat('chatAssistant', 'assistant');
  initChat('chatAbuela', 'abuela');
  initClippyWidget();
});
