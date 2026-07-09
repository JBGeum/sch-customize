window.addEventListener('load', function() {
document.addEventListener('dragstart', function (event) { event.preventDefault(); });

  // Dice Roll 툴팁 토글
  const diceRollElements = document.querySelectorAll('.dice-roll');
  diceRollElements.forEach(function (diceRollElement) {
    diceRollElement.addEventListener('click', function (event) {
      const clickedElement = event.target;
      if (clickedElement.matches('.dice-roll, .dice-roll *')) {
        const diceRoll = event.target.closest('.dice-roll');
        if (!diceRoll) return;
        const tooltips = diceRoll.querySelectorAll('.dice-tooltip');
        tooltips.forEach((tooltip) => {
          tooltip.classList.toggle('expanded');
        });
      }
    });
  });

  // Whisper 메시지 숨김 토글
  const whisperElements = document.querySelectorAll('.whisper');
  whisperElements.forEach(function (whisperElement) {
    whisperElement.addEventListener('click', function (event) {
      event.target.closest('.whisper').classList.toggle('whisper-hidden');
    });
  });

  // DnD5e Item Card 접기/펼치기 토글
  const collapsibleElements = document.querySelectorAll('.chat-card .description.collapsible');
  collapsibleElements.forEach(function (element) {
    // 페이지 로드 시 기본으로 접힌 상태
    element.classList.add('collapsed');
    element.addEventListener('click', function (event) {
      // 버튼이나 링크 클릭 시에는 토글하지 않음
      if (event.target.closest('button, a, input')) return;
      element.classList.toggle('collapsed');
    });
  });

  // .collapsible 클래스가 없는 description도 클릭으로 접기 가능하게
  const descriptionElements = document.querySelectorAll('.chat-card .description:not(.collapsible)');
  descriptionElements.forEach(function (element) {
    // 클릭 가능하도록 스타일 추가
    element.style.cursor = 'pointer';
    element.addEventListener('click', function (event) {
      if (event.target.closest('button, a, input')) return;
      element.classList.toggle('collapsed');
    });
  });
});
