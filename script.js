const pieces = document.querySelectorAll('.piece');
const primaryButton = document.querySelector('.primary-button');

pieces.forEach((piece, index) => {
  piece.addEventListener('mouseenter', () => {
    piece.style.transform = 'translateY(-6px) scale(1.02)';
    piece.style.boxShadow = '0 16px 28px rgba(139, 92, 246, 0.28)';
  });

  piece.addEventListener('mouseleave', () => {
    piece.style.transform = '';
    piece.style.boxShadow = '';
  });

  piece.style.animationDelay = `${index * 0.18}s`;
});

primaryButton?.addEventListener('click', () => {
  const original = primaryButton.textContent;
  primaryButton.textContent = 'Challenge started';
  primaryButton.disabled = true;
  primaryButton.style.opacity = '0.9';

  setTimeout(() => {
    primaryButton.textContent = original;
    primaryButton.disabled = false;
    primaryButton.style.opacity = '1';
  }, 1400);
});
