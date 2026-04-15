
(function(){
  function $(id){ return document.getElementById(id); }
  var _oldRenderCadence = window.renderCadence;
  window.renderCadence = function(list){
    var el = $('cad-list');
    if (!el) return;
    if (!list || !list.length) { el.innerHTML = '<div class="hist-empty">No contacts match.</div>'; return; }
    el.innerHTML = list.map(function(p) {
      var sub = [p.role, p.fellowship].filter(Boolean).join(' · ');
      var pid = esc(p.id);
      var days = parseInt(p.cadenceDays, 10) || 28;
      var isActive = p.active !== false;
      return '<div class="cad-row" id="crow-' + pid + '">' +
        '<div class="cad-top">' +
          '<div class="cad-av">' + esc(ini(p.name)) + '</div>' +
          '<div class="cad-info">' +
            '<div class="cad-name">' + esc(p.name) + '</div>' +
            (sub ? '<div class="cad-sub">' + esc(sub) + '</div>' : '') +
          '</div>' +
          '<div class="sw-wrap">' +
            '<label class="sw-label ' + (isActive ? 'on' : 'off') + '" id="clab-' + pid + '">' + (isActive ? 'Active' : 'Inactive') + '</label>' +
            '<label class="sw">' +
              '<input type="checkbox" id="ctog-' + pid + '" ' + (isActive ? 'checked' : '') + ' onchange="toggleActive(\'' + pid + '\')">' +
              '<span class="sw-track"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="cad-bottom">' +
          '<input class="cad-input" type="number" min="1" max="365" id="cad-' + pid + '" value="' + days + '">' +
          '<span class="cad-days-label">days</span>' +
          '<button class="cad-save" id="csave-' + pid + '" onclick="saveCad(\'' + pid + '\')">Save</button>' +
          '<span class="cad-status" id="cstat-' + pid + '"></span>' +
          '<button class="cad-edit" onclick="openEditModal(\'' + pid + '\')" title="Edit details" style="margin-left:auto;">✎</button>' +
        '</div>' +
      '</div>';
    }).join('');
  };

  var _oldInitCadencePage = window.initCadencePage;
  window.initCadencePage = function(){
    if (_oldInitCadencePage) _oldInitCadencePage();
    var sub = document.querySelector('#pg-cadence .form-sub');
    if (sub) sub.textContent = 'Set call cadence for each person.';
  };
})();
