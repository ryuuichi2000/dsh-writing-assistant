/* 写作模块 · 预览页选区工具条
 * 选中正文任意一段，点按钮生成一份结构化的修改请求：
 *   1) 复制到剪贴板，回到对话里粘贴；
 *   2) 嵌在宿主页面里时，同时 postMessage 给父页面（插件可以自动填进新对话）。
 * 协议见 references/revise.md 与 INTEGRATION.md。
 */
(function () {
  'use strict';

  var doc = window.__WRITING_DOC__;
  if (!doc || !doc.blocks || !doc.project) return;
  var prose = document.querySelector('.prose');
  if (!prose) return;

  var project = doc.project;
  var blockMap = {};
  doc.blocks.forEach(function (block) { blockMap[block.id] = block; });

  var ACTIONS = {
    rewrite: { label: '改写', hint: '保持原意，只改表达' },
    condense: { label: '精简', hint: '压到六成，不删信息' },
    expand: { label: '扩写', hint: '补机制或例子' },
    retone: { label: '按我的语气', hint: '事实与判断不变' },
    verify: { label: '查依据', hint: '只核对，不改稿' },
    ask: { label: '问一句', hint: '带着选区提问' }
  };
  var INSTRUCTIONS = {
    rewrite: '改写选中的内容：保持原意、事实、判断强度和篇幅量级不变，只改表达。',
    condense: '把选中的内容压缩到原长度约六成：删掉重复、铺垫和同义堆叠，不删独立信息。',
    expand: '把选中的内容展开：补机制、条件、例子或过渡；不新增未证实的数字、引文和结论。',
    retone: '按语气档案重写选中的内容；事实、判断强度与信息量不变。',
    verify: '不要改稿。只核对选中内容里的事实性陈述：逐条列出依据（来源、日期、原文）、可信度和待核点。',
    ask: ''
  };

  var tools = document.createElement('div');
  tools.className = 'sel-tools';
  tools.hidden = true;
  tools.setAttribute('role', 'toolbar');
  tools.innerHTML =
    '<div class="sel-head"><b>选区</b><span class="sel-count"></span>' +
    '<button class="sel-close" type="button" title="关闭">×</button></div>' +
    '<div class="sel-actions">' +
    Object.keys(ACTIONS).map(function (key) {
      return '<button type="button" data-act="' + key + '" title="' + ACTIONS[key].hint + '">' + ACTIONS[key].label + '</button>';
    }).join('') +
    '</div>' +
    '<div class="sel-extra"><input type="text" placeholder="补充要求（可留空）"><button type="button" data-act="send">发送</button></div>';
  document.body.appendChild(tools);

  var countEl = tools.querySelector('.sel-count');
  var extraInput = tools.querySelector('.sel-extra input');
  var toast = document.createElement('div');
  toast.className = 'toast';
  document.body.appendChild(toast);
  var toastTimer = null;
  var current = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  function offsetWithin(root, node, offset) {
    try {
      var range = document.createRange();
      range.selectNodeContents(root);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (err) {
      return 0;
    }
  }

  function readSelection() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    if (!prose.contains(range.commonAncestorContainer)) return null;
    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2) return null;

    var hits = [];
    var nodes = prose.querySelectorAll('[data-bid]');
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      if (!range.intersectsNode(el)) continue;
      var full = el.textContent || '';
      var start = 0;
      var end = full.length;
      if (el.contains(range.startContainer)) start = offsetWithin(el, range.startContainer, range.startOffset);
      if (el.contains(range.endContainer)) end = offsetWithin(el, range.endContainer, range.endOffset);
      if (end <= start) continue;
      hits.push({
        id: el.dataset.bid,
        start: Math.min(start, end),
        end: Math.max(start, end),
        selected: full.slice(Math.min(start, end), Math.max(start, end))
      });
    }
    if (!hits.length) return null;
    var rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text: text, blocks: hits, rect: rect };
  }

  function positionTools(rect) {
    var width = tools.offsetWidth || 340;
    var height = tools.offsetHeight || 120;
    var left = rect.left + window.scrollX;
    var vw = document.documentElement.clientWidth;
    left = Math.min(Math.max(8, left), vw - width - 10);
    var top = rect.bottom + window.scrollY + 10;
    if (rect.bottom + height + 20 > window.innerHeight) {
      top = rect.top + window.scrollY - height - 10;
    }
    tools.style.left = left + 'px';
    tools.style.top = Math.max(8, top) + 'px';
  }

  function showTools(info) {
    current = info;
    tools.hidden = false;
    countEl.textContent = info.blocks.length + ' 块 · ' + info.text.length + ' 字';
    positionTools(info.rect);
  }

  function hideTools() {
    current = null;
    tools.hidden = true;
    extraInput.value = '';
  }

  function payloadFor(action, extra) {
    if (!current) return null;
    var instruction = INSTRUCTIONS[action] || '';
    if (extra) instruction += '\n补充要求：' + extra;
    return {
      type: 'writing:edit-request',
      version: 1,
      project: {
        path: project.path,
        slug: project.slug,
        title: project.title,
        draftHash: project.draftHash,
        voice: project.voice
      },
      action: action,
      actionLabel: ACTIONS[action] ? ACTIONS[action].label : action,
      instruction: instruction,
      selection: {
        text: current.text,
        blocks: current.blocks.map(function (hit) {
          var block = blockMap[hit.id] || {};
          return {
            id: hit.id,
            hash: block.hash || '',
            type: block.type || '',
            section: block.section || '',
            raw: block.raw || '',
            start: hit.start,
            end: hit.end,
            selected: hit.selected
          };
        })
      },
      page: { url: location.href, at: new Date().toISOString() }
    };
  }

  function promptText(payload) {
    return [
      '（写作模块 · 选区修改请求）',
      '文章：' + (project.title || project.slug) + '（' + project.path + '）',
      '操作：' + payload.actionLabel + ' · ' + payload.selection.blocks.length + ' 块',
      '说明：' + payload.instruction,
      '',
      '请按下面的 JSON 改稿：只改 selection.blocks 这些块，选区外的文字不要动；每块改好的完整 Markdown 放进 edits[].replaceRaw，其余块保持原样；改完运行 python scripts/writing.py patch 应用，再 render。',
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```'
    ].join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand('copy');
        area.remove();
        ok ? resolve() : reject(new Error('execCommand copy failed'));
      } catch (err) {
        area.remove();
        reject(err);
      }
    });
  }

  function fallbackCopy(text) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:12px;max-width:720px;width:100%;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.3)';
    box.innerHTML = '<div style="font-size:13px;color:#666;margin-bottom:8px">浏览器不允许自动复制：全选下面文字（已选中），按 Ctrl+C，再回到对话粘贴。</div>';
    var area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'width:100%;height:260px;font:12px/1.5 ui-monospace,Consolas,monospace;border:1px solid #ddd;border-radius:8px;padding:8px';
    var close = document.createElement('button');
    close.textContent = '关闭';
    close.style.cssText = 'margin-top:8px;padding:6px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer';
    close.onclick = function () { overlay.remove(); };
    box.appendChild(area);
    box.appendChild(close);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    area.focus();
    area.select();
  }

  function deliver(action, extra) {
    var payload = payloadFor(action, extra);
    if (!payload) return;
    var text = promptText(payload);
    hideTools();
    copyText(text).then(function () {
      showToast('修改请求已复制 · 回到对话粘贴');
    }).catch(function () {
      fallbackCopy(text);
    });
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'writing:edit-request', payload: payload }, '*');
      } catch (err) {
        /* 父页面没接也没关系，剪贴板已经兜底 */
      }
    }
    window.__writingLastPayload = payload;
  }

  tools.addEventListener('mousedown', function (event) {
    event.preventDefault();
  });

  tools.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('sel-close')) {
      hideTools();
      return;
    }
    var action = button.dataset.act;
    if (action === 'send') {
      action = 'ask';
    }
    var extra = extraInput.value.trim();
    if (action === 'ask' && !extra) {
      var question = window.prompt('想问这段什么？（例如：这里的依据可靠吗？换成更直白的说法？）', '');
      if (!question || !question.trim()) return;
      extra = question.trim();
    }
    deliver(action, extra);
  });

  extraInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      deliver('ask', extraInput.value.trim() || null);
    }
  });

  document.addEventListener('mouseup', function (event) {
    if (tools.contains(event.target)) return;
    setTimeout(function () {
      var info = readSelection();
      if (info) showTools(info);
    }, 0);
  });

  document.addEventListener('mousedown', function (event) {
    if (!tools.contains(event.target)) hideTools();
  });

  document.addEventListener('keyup', function (event) {
    if (tools.contains(event.target)) return;
    if (event.key === 'Escape') {
      hideTools();
      return;
    }
    if (event.shiftKey || event.key.indexOf('Arrow') === 0) {
      var info = readSelection();
      if (info) showTools(info);
    }
  });

  document.addEventListener('selectionchange', function () {
    if (tools.hidden) return;
    if (tools.contains(document.activeElement)) return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideTools();
  });

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'writing:refresh') {
      location.reload();
    }
  });

  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage(
        { type: 'writing:ready', project: { slug: project.slug, title: project.title } },
        '*'
      );
    } catch (err) {
      /* 父页面没接也不影响阅读 */
    }
  }
})();
