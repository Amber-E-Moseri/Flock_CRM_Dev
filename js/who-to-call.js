
(function(){
  function $(id){ return document.getElementById(id); }
  window.__returnPageForLog = 'pg-home';

  function currentActivePage(){
    var active = document.querySelector('.page.active');
    return active ? active.id : 'pg-home';
  }
  function setReturnPage(pageId){
    if (!pageId || pageId === 'pg-log') return;
    window.__returnPageForLog = pageId;
  }
  function backToReturnPage(){
    var target = window.__returnPageForLog || 'pg-home';
    if (window.showPage) showPage(target);
  }
  window.backToReturnPage = backToReturnPage;

  // Preserve source page when entering Log a Call
  var _origShowPageNav = window.showPage;
  window.showPage = function(id, pushState){
    var current = currentActivePage();
    if (id === 'pg-log' && current !== 'pg-log') setReturnPage(current);
    return _origShowPageNav ? _origShowPageNav(id, pushState) : undefined;
  };

  var _origGoLogPerson = window.goLogPerson;
  window.goLogPerson = function(pid, name){
    setReturnPage(currentActivePage());
    return _origGoLogPerson ? _origGoLogPerson(pid, name) : undefined;
  };

  // Add back button / label on success screen
  function updateLogSuccessActions(){
    var screen = $('success-screen');
    if (!screen) return;
    var backBtn = $('log-return-btn');
    if (!backBtn) {
      backBtn = document.createElement('button');
      backBtn.id = 'log-return-btn';
      backBtn.className = 's-again';
      backBtn.style.marginTop = '10px';
      backBtn.style.background = 'var(--surface)';
      backBtn.style.color = 'var(--accent)';
      backBtn.style.border = '1px solid var(--accent)';
      backBtn.onclick = backToReturnPage;
      screen.appendChild(backBtn);
    }
    var labelMap = {
      'pg-analytics':'Back',
      'pg-dash':'Back',
      'pg-search':'Back',
      'pg-history':'Back',
      'pg-home':'Back'
    };
    backBtn.textContent = labelMap[window.__returnPageForLog] || 'Back';
  }

  // AI assist card removed - icon now lives in the Log a Call topbar
  function injectAiShortcut(){ }

  // After successful save, keep a clean way back to source page
  function attachPostSaveBehaviors(){
    updateLogSuccessActions();
  }

  var _oldOpenAiAssistCtx = window.openAiAssist;
  window.openAiAssist = function(){
    setReturnPage(currentActivePage());
    return _oldOpenAiAssistCtx ? _oldOpenAiAssistCtx() : undefined;
  };

  var _oldSaveCallNav = window.saveCall;
  window.saveCall = function(){
    var ret = _oldSaveCallNav ? _oldSaveCallNav() : undefined;
    setTimeout(function(){ if ($('success-screen') && $('success-screen').classList.contains('on')) attachPostSaveBehaviors(); }, 160);
    return ret;
  };

  var _oldConfirmAiLogNav = window.confirmAiLog;
  window.confirmAiLog = function(){
    var ret = _oldConfirmAiLogNav ? _oldConfirmAiLogNav() : undefined;
    setTimeout(function(){
      if ($('ai-step-success') && $('ai-step-success').style.display !== 'none') {
        var doneBtn = $('ai-step-success').querySelector('button');
        if (doneBtn) doneBtn.onclick = function(){ if (window.closeAiAssist) closeAiAssist(); backToReturnPage(); };
      }
    }, 180);
    return ret;
  };

  document.addEventListener('DOMContentLoaded', function(){
    injectAiShortcut();
    updateLogSuccessActions();
  });
})();
