const pieces = document.querySelectorAll('.piece');

pieces.forEach((piece, index) => {
  piece.addEventListener('mouseenter', () => {
    piece.style.transform = 'translateY(-6px) scale(1.02)';
    piece.style.boxShadow = '0 16px 24px rgba(139, 92, 246, 0.26)';
  });

  piece.addEventListener('mouseleave', () => {
    piece.style.transform = '';
    piece.style.boxShadow = '';
  });

  piece.style.animationDelay = `${index * 0.18}s`;
});

const primaryButton = document.querySelector('.primary-button');

primaryButton?.addEventListener('click', () => {
  primaryButton.textContent = 'Challenge started';
  primaryButton.disabled = true;
  primaryButton.style.opacity = '0.9';

  setTimeout(() => {
    primaryButton.textContent = 'Play now';
    primaryButton.disabled = false;
    primaryButton.style.opacity = '1';
  }, 1400);
});
