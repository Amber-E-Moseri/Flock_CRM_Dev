
(function(){
  // ── Log form todo items ──
  var _logTodos = [];

  window.getTodoItems = function(){ return _logTodos.slice(); };

  window.clearTodoItems = function(){
    _logTodos = [];
    var list = document.getElementById('todo-list');
    if (list) list.innerHTML = '';
    var inp = document.getElementById('todo-input');
    if (inp) inp.value = '';
    var dueInp = document.getElementById('todo-due-input');
    if (dueInp) dueInp.value = '';
    var dueRow = document.querySelector('.log-todo-due-row');
    if (dueRow) dueRow.classList.remove('on');
    var dueToggle = document.getElementById('todo-due-toggle');
    if (dueToggle) dueToggle.textContent = '+ Add due date';
  };

  window.addTodoItem = function(){
    var inp = document.getElementById('todo-input');
    var dueInp = document.getElementById('todo-due-input');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;
    var dueDate = dueInp ? dueInp.value : '';
    _logTodos.push({ text: text, dueDate: dueDate || '' });
    inp.value = '';
    if (dueInp) dueInp.value = '';
    var dueRow = document.querySelector('.log-todo-due-row');
    if (dueRow) dueRow.classList.remove('on');
    var dueToggle = document.getElementById('todo-due-toggle');
    if (dueToggle) dueToggle.textContent = '+ Add due date';
    renderLogTodos();
    inp.focus();
  };

  // Ensure any typed (but not yet added) action item is captured before saving a call.
  window.flushPendingLogTodoItem = function(){
    var inp = document.getElementById('todo-input');
    if (!inp) return false;
    if (!String(inp.value || '').trim()) return false;
    window.addTodoItem();
    return true;
  };

  window.toggleLogTodoDueDate = function(){
    var dueRow = document.querySelector('.log-todo-due-row');
    var dueInp = document.getElementById('todo-due-input');
    var dueToggle = document.getElementById('todo-due-toggle');
    if (!dueRow || !dueInp || !dueToggle) return;
    var isOn = dueRow.classList.toggle('on');
    if (isOn) {
      dueToggle.textContent = 'Due date added';
      setTimeout(function(){ dueInp.focus(); }, 0);
      return;
    }
    dueInp.value = '';
    dueToggle.textContent = '+ Add due date';
  };

  window.onLogTodoDueDateChange = function(){
    var dueInp = document.getElementById('todo-due-input');
    var dueToggle = document.getElementById('todo-due-toggle');
    if (!dueInp || !dueToggle) return;
    dueToggle.textContent = dueInp.value ? 'Due date added' : '+ Add due date';
  };

  function renderLogTodos(){
    var list = document.getElementById('todo-list');
    if (!list) return;
    list.innerHTML = _logTodos.map(function(item, i){
      var text = typeof item === 'object' ? item.text : item;
      var due = typeof item === 'object' ? item.dueDate : '';
      return '<div class="todo-item">' +
        '<div style="flex:1;min-width:0;">' +
          '<span class="todo-text">' + escHtml(text) + '</span>' +
          (due ? '<div class="todo-meta">Due: ' + escHtml(due) + '</div>' : '') +
        '</div>' +
        '<button class="todo-del" onclick="removeLogTodo(' + i + ')" title="Remove">&#215;</button>' +
      '</div>';
    }).join('');
  }

  window.removeLogTodo = function(i){
    _logTodos.splice(i, 1);
    renderLogTodos();
  };

  // Override getTodoItems for log form action items
  window.getTodoItems = function(){
    return _logTodos.map(function(item){
      if (!item) return null;
      var text = String(typeof item === 'object' ? item.text : item || '').trim();
      var dueDate = typeof item === 'object' ? item.dueDate : '';
      return text ? { text: text, dueDate: dueDate || '' } : null;
    }).filter(Boolean);
  };

  function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── To-Do page ──
  var _todoFilter = 'open';
  var _todoSort = 'person';
  var _allTodos   = [];
  var _editingTodoId = null;
  var _editingTodoBusy = false;
  var _manualTodosKey = 'ct-manual-todos';
  var _todoPeople = [];
  var _todoPeoplePromise = null;
  var _addingTodoDirect = false;

  function getManualTodos() {
    try {
      var raw = localStorage.getItem(_manualTodosKey);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch(e) { return []; }
  }

  function setManualTodos(list) {
    try { localStorage.setItem(_manualTodosKey, JSON.stringify(list || [])); } catch(e) {}
  }

  function todoIsoFromAny_(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function todoKey_(personId, text, done, dueDate) {
    return [String(personId || ''), String(text || '').trim().toLowerCase(), done ? '1' : '0', todoIsoFromAny_(dueDate)].join('|');
  }

  function dedupeTodos_(items) {
    var keep = {};
    (items || []).forEach(function(t){
      var key = todoKey_(t.personId, t.text, !!t.done, t.dueDateIso || t.dueDate);
      var existing = keep[key];
      if (!existing || (existing.localOnly && !t.localOnly)) {
        keep[key] = t;
      }
    });
    return Object.keys(keep).map(function(k){ return keep[k]; });
  }

  function mergeTodos(serverTodos) {
    var manual = getManualTodos();
    return dedupeTodos_((serverTodos || []).concat(manual));
  }

  function ensureTodoPeopleLoaded() {
    if (_todoPeople && _todoPeople.length) return Promise.resolve(_todoPeople);
    if (_todoPeoplePromise) return _todoPeoplePromise;
    _todoPeoplePromise = ((window.allPeople && window.allPeople.length)
      ? Promise.resolve(window.allPeople)
      : apiFetch('people'))
      .then(function(list){
        _todoPeople = Array.isArray(list) ? list : [];
        return _todoPeople;
      }).catch(function(){
        _todoPeople = [];
        return _todoPeople;
      }).finally(function(){
        _todoPeoplePromise = null;
      });
    return _todoPeoplePromise;
  }

  function normalizeName_(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function todoAssigneeOptionsHtml_(selectedId) {
    var selected = String(selectedId || 'manual');
    var options = [{ id: 'manual', name: 'My Tasks' }];
    (_todoPeople || []).forEach(function(p){
      var id = String(p && p.id || '');
      if (!id || id === 'manual') return;
      options.push({ id: id, name: String((p && p.name) || id) });
    });
    var seen = {};
    options = options.filter(function(o){
      if (seen[o.id]) return false;
      seen[o.id] = true;
      return true;
    }).sort(function(a, b){
      if (a.id === 'manual') return -1;
      if (b.id === 'manual') return 1;
      var an = String(a.name || '').toLowerCase();
      var bn = String(b.name || '').toLowerCase();
      return an < bn ? -1 : (an > bn ? 1 : 0);
    });
    return options.map(function(o){
      return '<option value="' + escHtml(o.id) + '"' + (o.id === selected ? ' selected' : '') + '>' + escHtml(o.name) + '</option>';
    }).join('');
  }

  function resolveAssigneeName_(personId, fallbackName) {
    var id = String(personId || 'manual');
    if (id === 'manual') return 'My Tasks';
    var found = (_todoPeople || []).find(function(p){ return String((p && p.id) || '') === id; });
    if (found) return String(found.name || found.id || 'My Tasks');
    return String(fallbackName || 'My Tasks');
  }

  function resolveTodoMention_(rawText) {
    var text = String(rawText || '').trim();
    if (!text) {
      return { personId: 'manual', personName: 'My Tasks', text: text, mentioned: false, mentionRaw: '' };
    }
    var mentionMatch = text.match(/@([^\s,;:!?()[\]{}]+)/);
    if (!mentionMatch) {
      return { personId: 'manual', personName: 'My Tasks', text: text, mentioned: false, mentionRaw: '' };
    }

    var mention = String(mentionMatch[1] || '').trim();
    var normMention = normalizeName_(mention);
    if (!normMention) {
      return { personId: 'manual', personName: 'My Tasks', text: text, mentioned: true, mentionRaw: '' };
    }

    var cleanText = text.replace(mentionMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    cleanText = cleanText.replace(/^[,;:\-–—\s]+/, '').trim();

    var candidates = (_todoPeople || []).map(function(p){
      var full = normalizeName_(p.name || '');
      var first = full.split(/\s+/)[0] || '';
      if (!full) return null;
      var score = -1;
      if (normMention === full) score = 100;
      else if (normMention === first) score = 95;
      else if (full.indexOf(normMention + ' ') === 0) score = 90;
      else if (full.indexOf(normMention) === 0) score = 85;
      else if (full.indexOf(normMention) >= 0) score = 70;
      return score >= 0 ? { person: p, score: score, fullLen: full.length } : null;
    }).filter(Boolean);

    candidates.sort(function(a, b){
      if (b.score !== a.score) return b.score - a.score;
      return b.fullLen - a.fullLen;
    });

    if (candidates.length) {
      var chosen = candidates[0].person;
      return {
        personId: String(chosen.id),
        personName: chosen.name || 'My Tasks',
        text: cleanText || text,
        mentioned: true,
        mentionRaw: mention
      };
    }

    return { personId: 'manual', personName: 'My Tasks', text: cleanText || text, mentioned: true, mentionRaw: mention };
  }

  window.addTodoDirect = function(){
    var inp = document.getElementById('todo-direct-input');
    var dueInp = document.getElementById('todo-direct-due');
    var btn = document.getElementById('todo-direct-btn');
    if (!inp || !btn) return;
    if (_addingTodoDirect) return;
    var raw = inp.value.trim();
    if (!raw) return;
    _addingTodoDirect = true;
    btn.disabled = true;
    ensureTodoPeopleLoaded().then(function(){
      var resolved = resolveTodoMention_(raw);
      var text = String(resolved.text || '').trim();
      if (!text) {
        if (window.showUxToast) showUxToast('Add text after the @name');
        return;
      }
      var personId = resolved.personId || 'manual';
      var personName = resolved.personName || 'My Tasks';
      var dueDateIso = todoIsoFromAny_(dueInp ? dueInp.value : '');
      var payload = {
        interactionId: 'manual-' + Date.now(),
        personId: personId,
        personName: personName,
        todos: [{ text: text, dueDate: dueDateIso || '' }]
      };
      return apiPost('saveTodos', { payload: payload }).then(function(res){
        if (!res || res.success !== true) throw new Error((res && res.error) ? res.error : 'Save failed');
        var localAfter = getManualTodos().filter(function(t){
          return todoKey_(t.personId, t.text, !!t.done, t.dueDateIso || t.dueDate) !== todoKey_(payload.personId, text, false, dueDateIso);
        });
        setManualTodos(localAfter);
        inp.value = '';
        if (dueInp) dueInp.value = '';
        loadTodos();
        if (window.showUxToast) {
          if (resolved.mentioned && personId === 'manual' && resolved.mentionRaw) showUxToast('No person matched @' + resolved.mentionRaw + ' - saved to My Tasks');
          else showUxToast('To-do added');
        }
      }).catch(function(){
        var local = getManualTodos();
        var candidate = {
          id: 'local-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          personId: personId || 'manual',
          personName: personName,
          text: text,
          dueDate: dueDateIso || '',
          dueDateIso: dueDateIso || '',
          done: false,
          createdAt: 'Saved locally',
          localOnly: true
        };
        var exists = local.some(function(t){
          return todoKey_(t.personId, t.text, !!t.done, t.dueDateIso || t.dueDate) === todoKey_(candidate.personId, candidate.text, false, candidate.dueDateIso);
        });
        if (!exists) local.unshift(candidate);
        setManualTodos(local);
        inp.value = '';
        if (dueInp) dueInp.value = '';
        _allTodos = mergeTodos(_allTodos.filter(function(t){ return !t.localOnly; }));
        renderTodos(_allTodos);
        updateHomeTodoSub(_allTodos);
        if (window.showUxToast) showUxToast('Saved locally - will sync on next successful save');
      });
    }).finally(function(){
      _addingTodoDirect = false;
      btn.disabled = false;
    });
  };

  window.setTodoFilter = function(f){
    _todoFilter = f;
    document.getElementById('tf-open').className = 'todo-filter-btn' + (f === 'open' ? ' active' : '');
    document.getElementById('tf-all').className  = 'todo-filter-btn' + (f === 'all'  ? ' active' : '');
    renderTodos(_allTodos);
  };

  window.setTodoSort = function(mode){
    _todoSort = (mode === 'due') ? 'due' : 'person';
    var sel = document.getElementById('ts-sort');
    if (sel) sel.value = _todoSort;
    renderTodos(_allTodos);
  };

  window.loadTodos = function(){
    var body = document.getElementById('todos-body');
    if (!body) return;
    body.innerHTML = '<div class="people-loading" style="padding:40px 0"><span>Loading</span><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    apiFetch('getTodos').then(function(res){
      _allTodos = mergeTodos((res && res.todos) ? res.todos : []);
      renderTodos(_allTodos);
      updateHomeTodoSub(_allTodos);
    }).catch(function(e){
      _allTodos = mergeTodos([]);
      if (_allTodos.length) {
        renderTodos(_allTodos);
        updateHomeTodoSub(_allTodos);
      } else {
        body.innerHTML = '<div class="err-box">Could not load to-dos.<br><small>' + String(e) + '</small></div>';
      }
    });
  };

  document.addEventListener('DOMContentLoaded', function(){
    ensureTodoPeopleLoaded();
    var sel = document.getElementById('ts-sort');
    if (sel) sel.value = _todoSort;
  });

  function updateHomeTodoSub(todos){
    var open = todos.filter(function(t){ return !t.done; }).length;
    var sub = document.getElementById('home-todo-sub');
    if (sub) sub.textContent = open > 0 ? open + ' open item' + (open > 1 ? 's' : '') : 'All caught up ✓';
  }

  function renderTodos(todos){
    var body = document.getElementById('todos-body');
    if (!body) return;
    var list = _todoFilter === 'open' ? todos.filter(function(t){ return !t.done; }) : todos;
    if (!list.length){
      if (_todoFilter === 'open') {
        body.innerHTML =
          '<div class="hist-empty">' +
            '<div class="todo-empty-title">You\'re all caught up 🎉</div>' +
            '<div class="todo-empty-sub">Add a task to get started</div>' +
          '</div>';
      } else {
        body.innerHTML = '<div class="hist-empty">No action items yet.</div>';
      }
      return;
    }

    function dueStamp_(t) {
      var iso = todoIsoFromAny_(t.dueDateIso || t.dueDate);
      return iso ? new Date(iso + 'T00:00:00').getTime() : Number.MAX_SAFE_INTEGER;
    }

    function dueLabel_(t) {
      var iso = todoIsoFromAny_(t.dueDateIso || t.dueDate);
      if (!iso) return 'No Due Date';
      return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    }

    // Normalize ordering before grouping
    var sorted = list.slice().sort(function(a, b){
      var ad = dueStamp_(a), bd = dueStamp_(b);
      if (ad !== bd) return ad - bd;
      var an = String(a.personName || '').toLowerCase();
      var bn = String(b.personName || '').toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;
      var at = String(a.text || '').toLowerCase();
      var bt = String(b.text || '').toLowerCase();
      return at < bt ? -1 : (at > bt ? 1 : 0);
    });

    // Group by selected sort mode
    var groups = {};
    var order  = [];
    sorted.forEach(function(t){
      var key;
      var label;
      if (_todoSort === 'due') {
        key = todoIsoFromAny_(t.dueDateIso || t.dueDate) || 'zzzz-nodue';
        label = dueLabel_(t);
      } else {
        key = String(t.personId || 'unknown');
        label = t.personName || 'Unknown';
      }
      if (!groups[key]) {
        groups[key] = { name: label, items: [] };
        order.push(key);
      }
      groups[key].items.push(t);
    });

    if (_todoSort === 'person') {
      order.sort(function(a, b){
        var an = String(groups[a].name || '').toLowerCase();
        var bn = String(groups[b].name || '').toLowerCase();
        return an < bn ? -1 : (an > bn ? 1 : 0);
      });
    } else {
      order.sort(function(a, b){
        if (a === 'zzzz-nodue') return 1;
        if (b === 'zzzz-nodue') return -1;
        return a < b ? -1 : (a > b ? 1 : 0);
      });
    }

    var html = '';
    order.forEach(function(key){
      var g = groups[key];
      html += '<div class="todo-person-group">';
      var rightLabel = (_todoSort === 'due')
        ? (g.items.length + ' item' + (g.items.length === 1 ? '' : 's'))
        : (g.items.filter(function(i){ return !i.done; }).length + ' open');
      html += '<div class="todo-person-label"><span>' + escHtml(g.name) + '</span><span>' + rightLabel + '</span></div>';
      g.items.forEach(function(t){
        var done = t.done;
        var isEditing = (_editingTodoId === t.id);
        html += '<div class="todo-item' + (done ? ' done-item' : '') + '" id="tdi-' + escHtml(t.id) + '">';
        html += '<input type="checkbox" class="todo-cb" ' + (done ? 'checked' : '') + ' onchange="toggleTodo(\'' + escHtml(t.id) + '\',this.checked)">';
        html += '<div style="flex:1;min-width:0;">';
        if (isEditing) {
          html += '<input class="todo-edit-input todo-edit-text" type="text" value="' + escHtml(t.text) + '" maxlength="240" onkeydown="if(event.key===\'Enter\'){event.preventDefault();saveTodoInline(\'' + escHtml(t.id) + '\');} if(event.key===\'Escape\'){event.preventDefault();cancelTodoInline();}">';
          html += '<input class="todo-edit-input todo-edit-due" type="date" value="' + escHtml(todoIsoFromAny_(t.dueDateIso || t.dueDate)) + '" style="margin-top:6px;" title="Due date">';
          html += '<div class="todo-edit-assignee-row">';
          html += '<span class="todo-edit-assignee-label">Assigned</span>';
          html += '<select class="todo-edit-assignee" title="Change assignee">' + todoAssigneeOptionsHtml_(t.personId) + '</select>';
          html += '</div>';
          html += '<div class="todo-edit-actions">';
          html += '<button class="todo-edit-btn save" onclick="saveTodoInline(\'' + escHtml(t.id) + '\')" ' + (_editingTodoBusy ? 'disabled' : '') + '>Save</button>';
          html += '<button class="todo-edit-btn" onclick="cancelTodoInline()" ' + (_editingTodoBusy ? 'disabled' : '') + '>Cancel</button>';
          html += '</div>';
        } else {
          html += '<div class="todo-text' + (done ? ' done-text' : '') + '">' + escHtml(t.text) + '</div>';
        }
        var metaBits = [];
        if (t.dueDate) metaBits.push('Due: ' + escHtml(t.dueDate));
        if (t.createdAt) metaBits.push('Created: ' + escHtml(t.createdAt));
        if (metaBits.length) html += '<div class="todo-meta">' + metaBits.join(' • ') + '</div>';
        html += '</div>';
        if (!isEditing) {
          html += '<button class="todo-del" onclick="startTodoInlineEdit(\'' + escHtml(t.id) + '\')" title="Edit task note" aria-label="Edit task note" style="font-size:16px;padding:2px 4px;">🖊️</button>';
        }
        html += '<button class="todo-del" onclick="deleteTodo(\'' + escHtml(t.id) + '\')" title="Delete task" aria-label="Delete task">&#215;</button>';
        html += '</div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }

  window.toggleTodo = function(todoId, done){
    // Optimistic UI update
    var row = document.getElementById('tdi-' + todoId);
    if (row){
      row.className = 'todo-item' + (done ? ' done-item' : '');
      var txt = row.querySelector('.todo-text');
      if (txt) txt.className = 'todo-text' + (done ? ' done-text' : '');
    }
    var t = _allTodos.find(function(x){ return x.id === todoId; });
    if (t) t.done = done;
    if (t && t.localOnly) {
      var localItems = getManualTodos();
      localItems = localItems.map(function(item){
        if (item.id === todoId) item.done = done;
        return item;
      });
      setManualTodos(localItems);
      updateHomeTodoSub(_allTodos);
      if (_todoFilter === 'open' && done) setTimeout(function(){ renderTodos(_allTodos); }, 250);
      return;
    }
    apiPost('updateTodo', { todoId: todoId, done: done ? 'true' : 'false' }).then(function(){
      updateHomeTodoSub(_allTodos);
      if (_todoFilter === 'open' && done) {
        setTimeout(function(){ renderTodos(_allTodos); }, 600);
      }
    }).catch(function(){
      // Revert on failure
      if (t) t.done = !done;
      if (row){
        row.className = 'todo-item' + (!done ? ' done-item' : '');
        var txt = row.querySelector('.todo-text');
        if (txt) txt.className = 'todo-text' + (!done ? ' done-text' : '');
      }
    });
  };

  window.deleteTodo = function(todoId){
    if (!todoId) return;
    var row = document.getElementById('tdi-' + todoId);
    var t = _allTodos.find(function(x){ return x.id === todoId; });
    var wasLocal = !!(t && t.localOnly);
    if (row) row.style.opacity = '.45';

    if (wasLocal) {
      var local = getManualTodos().filter(function(item){ return item.id !== todoId; });
      setManualTodos(local);
      _allTodos = _allTodos.filter(function(item){ return item.id !== todoId; });
      renderTodos(_allTodos);
      updateHomeTodoSub(_allTodos);
      if (window.showUxToast) showUxToast('Task deleted');
      return;
    }

    apiPost('deleteTodo', { todoId: todoId }).then(function(res){
      if (!res || res.success !== true) throw new Error((res && res.error) ? res.error : 'Delete failed');
      // Also clear any matching local-only shadow entry so it does not reappear as "Saved locally".
      var local = getManualTodos();
      if (t) {
        var pid = String(t.personId || '');
        var txt = String(t.text || '').trim().toLowerCase();
        var due = todoIsoFromAny_(t.dueDateIso || t.dueDate);
        local = local.filter(function(item){
          var samePid = String(item.personId || '') === pid;
          var sameTxt = String(item.text || '').trim().toLowerCase() === txt;
          var sameDue = todoIsoFromAny_(item.dueDateIso || item.dueDate) === due;
          return !(samePid && sameTxt && sameDue);
        });
        setManualTodos(local);
      }
      _allTodos = _allTodos.filter(function(item){ return item.id !== todoId; });
      _allTodos = mergeTodos(_allTodos.filter(function(item){ return !item.localOnly; }));
      renderTodos(_allTodos);
      updateHomeTodoSub(_allTodos);
      if (window.showUxToast) showUxToast('Task deleted');
    }).catch(function(){
      if (row) row.style.opacity = '';
      if (window.showUxToast) showUxToast('Could not delete task');
    });
  };

  window.editTodoText = function(todoId){
    window.startTodoInlineEdit(todoId);
  };

  window.startTodoInlineEdit = function(todoId){
    if (!todoId) return;
    _editingTodoId = todoId;
    _editingTodoBusy = false;
    renderTodos(_allTodos);
    setTimeout(function(){
      var row = document.getElementById('tdi-' + todoId);
      var inp = row ? row.querySelector('.todo-edit-input') : null;
      if (inp) { inp.focus(); inp.select(); }
    }, 10);
  };

  window.cancelTodoInline = function(){
    _editingTodoId = null;
    _editingTodoBusy = false;
    renderTodos(_allTodos);
  };

  window.saveTodoInline = function(todoId){
    if (!todoId || _editingTodoBusy) return;
    var t = _allTodos.find(function(x){ return x.id === todoId; });
    if (!t) return;

    var row = document.getElementById('tdi-' + todoId);
    var inp = row ? row.querySelector('.todo-edit-text') : null;
    var dueInp = row ? row.querySelector('.todo-edit-due') : null;
    var assigneeSel = row ? row.querySelector('.todo-edit-assignee') : null;
    var current = String(t.text || '');
    var next = String(inp ? inp.value : current).trim();
    var currentDue = todoIsoFromAny_(t.dueDateIso || t.dueDate);
    var nextDue = todoIsoFromAny_(dueInp ? dueInp.value : currentDue);
    var currentPid = String(t.personId || 'manual');
    var nextPid = String(assigneeSel ? assigneeSel.value : currentPid || 'manual');
    var currentPname = String(t.personName || 'My Tasks');
    var nextPname = resolveAssigneeName_(nextPid, currentPname);
    if (!next) {
      if (window.showUxToast) showUxToast('Task note cannot be empty');
      return;
    }
    if (next === current && nextDue === currentDue && nextPid === currentPid) {
      _editingTodoId = null;
      _editingTodoBusy = false;
      renderTodos(_allTodos);
      return;
    }

    var oldText = current;
    var oldDue = currentDue;
    var oldPid = currentPid;
    var oldPname = currentPname;
    t.text = next;
    t.dueDateIso = nextDue || '';
    t.dueDate = nextDue ? new Date(nextDue + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
    t.personId = nextPid;
    t.personName = nextPname;
    _editingTodoBusy = true;
    renderTodos(_allTodos);

    if (t.localOnly) {
      var local = getManualTodos().map(function(item){
        if (item.id === todoId) {
          item.text = next;
          item.dueDateIso = nextDue || '';
          item.dueDate = t.dueDate || '';
          item.personId = nextPid;
          item.personName = nextPname;
        }
        return item;
      });
      setManualTodos(local);
      _editingTodoId = null;
      _editingTodoBusy = false;
      renderTodos(_allTodos);
      if (window.showUxToast) showUxToast('Task updated');
      return;
    }

    var reqs = [];
    if (next !== current) reqs.push(apiPost('updateTodoText', { todoId: todoId, text: next }));
    if (nextDue !== currentDue) reqs.push(apiPost('updateTodoDueDate', { todoId: todoId, dueDate: nextDue || '' }));
    if (nextPid !== currentPid) reqs.push(apiPost('updateTodoAssignee', { todoId: todoId, personId: nextPid, personName: nextPname }));
    Promise.all(reqs).then(function(results){
      if (results.some(function(res){ return !res || res.success !== true; })) throw new Error('Update failed');
      _editingTodoId = null;
      _editingTodoBusy = false;
      renderTodos(_allTodos);
      if (window.showUxToast) showUxToast('Task updated');
    }).catch(function(){
      t.text = oldText;
      t.dueDateIso = oldDue || '';
      t.dueDate = oldDue ? new Date(oldDue + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
      t.personId = oldPid;
      t.personName = oldPname;
      _editingTodoBusy = false;
      renderTodos(_allTodos);
      if (window.showUxToast) showUxToast('Could not update task');
    });
  };
})();
