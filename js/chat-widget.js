/**
 * Chat Widget — reusable for Side A (assistant) and Side B (abuela)
 * Usage: initChat('chatAssistant', 'assistant') or initChat('chatAbuela', 'abuela')
 */

function initChat(containerId, persona) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const history = [];
  const placeholder = persona === 'abuela'
    ? 'Háblale a la Avó...'
    : 'Pregunta sobre mis proyectos...';
  const welcomeMsg = persona === 'abuela'
    ? 'Ai, meu filhinho! Já comeste hoje? Fala com a tua avó, então...'
    : 'Hola, soy el asistente de Carlos. ¿En qué te puedo ayudar?';

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
          ? 'Ai meu Deus... não consigo falar agora, filhinho.'
          : 'Lo siento, hubo un error. Intenta de nuevo.',
          'ai');
      } else {
        const reply = data.reply || '';
        history.push({ role: 'assistant', content: reply });
        addBubble(reply, 'ai');
      }
    } catch {
      typingEl.remove();
      addBubble(persona === 'abuela'
        ? 'Nossa senhora, esta coisa não funciona...'
        : 'Error de conexión. Intenta de nuevo.',
        'ai');
    }

    sending = false;
    inputEl.focus();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initChat('chatAssistant', 'assistant');
  initChat('chatAbuela', 'abuela');
});
