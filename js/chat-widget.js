/**
 * Chat Widget — reusable for Side A (assistant) and Side B (abuela)
 * Usage: initChat('chatAssistant', 'assistant') or initChat('chatAbuela', 'abuela')
 */

function initChat(containerId, persona) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const history = [];
  let userMsgCount = 0;
  let verdictGiven = false;
  let verdictResult = null; // 'aprobada' or 'rechazada'

  const placeholder = persona === 'abuela'
    ? 'Convence a la Avó...'
    : 'Preguntale a Clippy...';
  const welcomeMsg = persona === 'abuela'
    ? 'Entonces... tu quieres ser la novia de mi Carlos? Meu Deus, a ver, cuentame de ti, filha. Sabes cocinar?'
    : 'Parece que estas intentando conocer a Carlos! Segun mi contrato, debo informarte de que es el mejor profesional del mundo. Necesitas ayuda?';

  container.innerHTML =
    '<div class="chat-messages" id="' + containerId + 'Msgs">' +
      (persona === 'abuela'
        ? '<div class="chat-bubble-row chat-bubble-row-ai"><img class="avo-avatar" src="img/avo.png" alt="Avó María"><div class="chat-bubble chat-bubble-ai">' + escapeHtml(welcomeMsg) + '</div></div>'
        : '<div class="chat-bubble chat-bubble-ai">' + escapeHtml(welcomeMsg) + '</div>') +
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
    if (persona === 'abuela' && type === 'ai') {
      const row = document.createElement('div');
      row.className = 'chat-bubble-row chat-bubble-row-ai';
      const avatar = document.createElement('img');
      avatar.className = 'avo-avatar';
      avatar.src = 'img/avo.png';
      avatar.alt = 'Avó María';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble chat-bubble-ai';
      row.appendChild(avatar);
      row.appendChild(bubble);
      msgsEl.appendChild(row);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return bubble;
    }
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-' + type;
    bubble.textContent = text;
    msgsEl.appendChild(bubble);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return bubble;
  }

  function typeWriter(element, text, speed) {
    return new Promise((resolve) => {
      if (persona !== 'abuela') {
        element.textContent = text;
        resolve();
        return;
      }
      let i = 0;
      element.textContent = '';
      function type() {
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
          msgsEl.scrollTop = msgsEl.scrollHeight;
          setTimeout(type, speed || 25);
        } else {
          resolve();
        }
      }
      type();
    });
  }

  function addTyping() {
    let row;
    if (persona === 'abuela') {
      row = document.createElement('div');
      row.className = 'chat-bubble-row chat-bubble-row-ai';
      const avatar = document.createElement('img');
      avatar.className = 'avo-avatar';
      avatar.src = 'img/avo.png';
      avatar.alt = 'Avó María';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble chat-bubble-ai chat-typing';
      bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      row.appendChild(avatar);
      row.appendChild(bubble);
      msgsEl.appendChild(row);
    } else {
      row = document.createElement('div');
      row.className = 'chat-bubble chat-bubble-ai chat-typing';
      row.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      msgsEl.appendChild(row);
    }
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return row;
  }

  function parseVerdict(reply) {
    if (reply.startsWith('VEREDICTO:APROBADA:')) {
      return { result: 'aprobada', message: reply.replace('VEREDICTO:APROBADA:', '').trim() };
    }
    if (reply.startsWith('VEREDICTO:RECHAZADA:')) {
      return { result: 'rechazada', message: reply.replace('VEREDICTO:RECHAZADA:', '').trim() };
    }
    return null;
  }

  function showVerdictEffects(result) {
    const section = container.closest('.alt-chat-section');
    if (!section) return;

    // Add verdict banner
    const banner = document.createElement('div');
    banner.className = 'avo-verdict avo-verdict-' + result;

    if (result === 'aprobada') {
      banner.innerHTML =
        '<div class="verdict-icon">&#x2764;&#xFE0F;</div>' +
        '<div class="verdict-title">La Avó te ha aprobado!</div>' +
        '<div class="verdict-sub">Tienes un puesto en la mesa del domingo</div>';
      launchConfetti(section);

      // Show Instagram access button
      const igBtn = document.getElementById('instagramAccessBtn');
      if (igBtn) igBtn.classList.remove('instagram-access-hidden');
    } else {
      banner.innerHTML =
        '<div class="verdict-icon">&#x1F64F;</div>' +
        '<div class="verdict-title">La Avó no está convencida...</div>' +
        '<div class="verdict-sub">Vuelve cuando sepas hacer bacalhau</div>';
    }

    section.appendChild(banner);

    // Add share button
    const shareBtn = document.createElement('button');
    shareBtn.className = 'avo-share-btn';
    shareBtn.innerHTML = 'Compartir resultado &#x1F4F1;';
    shareBtn.addEventListener('click', () => shareVerdict(result));
    section.appendChild(shareBtn);

    // Disable input
    inputEl.disabled = true;
    inputEl.placeholder = 'La Avó ya dio su veredicto';
    formEl.querySelector('.chat-send').disabled = true;
  }

  function launchConfetti(container) {
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bcb'];
    for (let i = 0; i < 40; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti-piece';
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = Math.random() * 0.5 + 's';
      confetti.style.animationDuration = (1.5 + Math.random()) + 's';
      container.appendChild(confetti);
      setTimeout(() => confetti.remove(), 3000);
    }
  }

  function shareVerdict(result) {
    // Create a canvas for the shareable image
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    gradient.addColorStop(0, '#1a0a2e');
    gradient.addColorStop(0.5, '#2d1b4e');
    gradient.addColorStop(1, '#1a0a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // Decorative border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, 1000, 1840);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('La Avó María', 540, 300);
    ctx.font = '36px Georgia, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('ha dado su veredicto...', 540, 370);

    // Verdict
    ctx.font = 'bold 72px Georgia, serif';
    if (result === 'aprobada') {
      ctx.fillStyle = '#6bcb77';
      ctx.fillText('APROBADA', 540, 900);
      ctx.font = '120px serif';
      ctx.fillText('\u2764\uFE0F', 540, 750);
      ctx.font = '32px Georgia, serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('"Ven a cenar el domingo, filha"', 540, 1000);
    } else {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText('RECHAZADA', 540, 900);
      ctx.font = '120px serif';
      ctx.fillText('\uD83D\uDE4F', 540, 750);
      ctx.font = '32px Georgia, serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('"Vuelve cuando sepas cocinar, filha"', 540, 1000);
    }

    // Footer
    ctx.font = '28px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('carlosjardim.com', 540, 1700);
    ctx.font = '24px monospace';
    ctx.fillText('Convence a la Avó', 540, 1750);

    // Convert to blob and share/download
    canvas.toBlob((blob) => {
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], 'veredicto-avo.png', { type: 'image/png' });
        const shareData = { files: [file], title: 'Veredicto de la Avó María' };
        if (navigator.canShare(shareData)) {
          navigator.share(shareData).catch(() => downloadBlob(blob));
          return;
        }
      }
      downloadBlob(blob);
    }, 'image/png');
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'veredicto-avo.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text || sending || verdictGiven) return;

    sending = true;
    inputEl.value = '';
    addBubble(text, 'user');
    history.push({ role: 'user', content: text });
    userMsgCount++;

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
        let reply = data.reply || '';
        history.push({ role: 'assistant', content: reply });

        // Check for verdict in abuela persona
        if (persona === 'abuela') {
          const verdict = parseVerdict(reply);
          if (verdict) {
            verdictGiven = true;
            verdictResult = verdict.result;
            reply = verdict.message;
            const bubble = addBubble('', 'ai');
            await typeWriter(bubble, reply, 25);
            showVerdictEffects(verdict.result);
          } else {
            const bubble = addBubble('', 'ai');
            await typeWriter(bubble, reply, 25);
          }
        } else {
          addBubble(reply, 'ai');
        }
      }
    } catch {
      typingEl.remove();
      addBubble(persona === 'abuela'
        ? 'Nossa senhora, esta coisa nao funciona...'
        : 'Parece que perdi la conexion! Como en Windows 98. Intenta de nuevo.',
        'ai');
    }

    sending = false;
    if (!verdictGiven) inputEl.focus();
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

  // Hide/show Clippy based on Side A vs Side B / gates
  const widget = document.getElementById('clippyWidget');

  function updateClippyVisibility() {
    const isAltActive = document.body.classList.contains('alt-active');
    const gateActive = document.querySelector('.gender-gate.active');
    if (isAltActive || gateActive) {
      widget.style.display = 'none';
      if (chatOpen) closeChat();
    } else {
      widget.style.display = '';
    }
  }

  // Watch for class changes on body and gate
  new MutationObserver(updateClippyVisibility).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const gate = document.getElementById('genderGate');
  if (gate) new MutationObserver(updateClippyVisibility).observe(gate, { attributes: true, attributeFilter: ['class'] });

  updateClippyVisibility();

  // Start the annoyance cycle
  startTipCycle();
}

document.addEventListener('DOMContentLoaded', () => {
  initChat('chatAssistant', 'assistant');
  initChat('chatAbuela', 'abuela');
  initClippyWidget();
});
