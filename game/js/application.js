// Wait for DOM ready
document.addEventListener("DOMContentLoaded", function () {
  window.gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
});
