const themes = {
  1: {
    kicker: 'CELESTIAL ATTRIBUTE ARCHIVE · 01',
    title: '详细属性 · 星海天阙',
  },
  2: {
    kicker: 'THE MYRIAD REALMS STELE · 02',
    title: '详细属性 · 万界天碑',
  },
  3: {
    kicker: 'HEAVENLY OBSERVATORY · 03',
    title: '详细属性 · 天机观测台',
  },
};

function activateTheme(value) {
  const theme = themes[value] ? String(value) : '1';
  document.body.dataset.theme = theme;
  document.querySelector('.concept-kicker').textContent = themes[theme].kicker;
  document.querySelector('.footer-index').textContent = `0${theme}`;
  document.title = themes[theme].title;
  document.querySelectorAll('[data-theme-button]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeButton === theme));
  });
}

const params = new URLSearchParams(window.location.search);
if (params.get('capture') === '1') document.body.classList.add('capture-mode');
activateTheme(params.get('concept') || window.location.hash.replace('#', ''));

document.querySelectorAll('[data-theme-button]').forEach(button => {
  button.addEventListener('click', () => {
    activateTheme(button.dataset.themeButton);
    history.replaceState(null, '', `#${button.dataset.themeButton}`);
  });
});
