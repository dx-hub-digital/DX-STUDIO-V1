document.addEventListener('DOMContentLoaded', () => {
  // Verificação de Dependências Críticas
  if (typeof CodeMirror === 'undefined') {
    console.error("DX Studio: CodeMirror não foi carregado. Verifique sua conexão ou os links do CDN.");
    document.body.innerHTML = "<div style='padding:20px; color:white; background:#b00;'>Erro Crítico: CodeMirror não carregado.</div>";
    return;
  }

  const $ = (sel) => document.querySelector(sel);

  // Variáveis de estado globais do sistema de redimensionamento
  let isResizingTabWidth = false;
  let activeTabResizing = null;
  let resizeSide = 'right';
  let isResizingH = false;
  let isResizingV = false;
  let isResizingSidebar = false;
  let isResizingTabBar = false;
  let isResizingTerminal = false;

  const modeSelect = $('#modeSelect');
  const runBtn = $('#runBtn');
  // Seleção de elementos com segurança
  const saveBtn = $('#saveBtn'), copyBtn = $('#copyBtn'), clearBtn = $('#clearBtn');
  const snapshotBtn = $('#snapshotBtn'), prettierBtn = $('#prettierBtn'), exportBtn = $('#exportBtn');
  const statusText = $('#status-text'), autosaveStatus = $('#autosave-status');
  const consoleEl = $('#console'), previewFrame = $('#preview');
  const resizerH = $('#resizerH'), resizerV = $('#resizerV'), resizerS = $('#resizerS');
  const tabBarResizerV = $('#tabBarResizerV');
  const resizerTerminal = $('#resizerTerminal');
  const terminalInput = $('#terminalInput');
  const terminalOutput = $('#terminalOutput');
  const edPanel = $('.editorPanel'), prePanel = $('.previewPanel');
  const consoleWrap = $('.consoleWrap');
  const contextMenu = $('#tabContextMenu');

  // Outros elementos da UI
  const toggleConsoleBtn = $('#toggleConsoleBtn'), toggleAllObjectsBtn = $('#toggleAllObjectsBtn');
  const fullscreenBtn = $('#fullscreenBtn'), exportConsoleBtn = $('#exportConsoleBtn');
  const clearConsoleBtn = $('#clearConsoleBtn'), saveNowBtn = $('#saveNowBtn');
  const resetLayoutBtn = $('#resetLayoutBtn'), resetFactoryBtn = $('#resetFactoryBtn');
  const sidebarSearchInput = $('#sidebarSearchInput'), togglePreviewToolbarBtn = $('#togglePreviewToolbarBtn');
  const closePreviewBtn = $('#closePreviewBtn'), openPreviewBtn = $('#openPreviewBtn');
  const themeSelect = $('#themeSelect'), fontSizeSelect = $('#fontSizeSelect');
  const consoleSearchInput = $('#consoleSearchInput'), consoleTimeSelect = $('#consoleTimeSelect');
  const autoClearSelect = $('#autoClearSelect'), snapshotTimerSelect = $('#snapshotTimerSelect');
  const cdnInput = $('#cdnInput'), consoleFilterSelect = $('#consoleFilterSelect');
  const deviceSelect = $('#deviceSelect'), zoomRange = $('#zoomRange');
  const orientationBtn = $('#orientationBtn'), fitBtn = $('#fitBtn'), resetZoomBtn = $('#resetZoomBtn');
  const addTabBtn = $('#addTabBtn'), resIndicator = $('#resIndicator');
  const storageBar = $('#storageBar'), storageText = $('#storageText');
  const historyList = $('#historyList'), toastEl = $('#toast');
  const shutterSound = $('#shutterSound'), flashEffect = $('#flashEffect');
  const successSound = $('#successSound');

  // Elementos do Command Palette
  const commandPalette = $('#commandPalette');
  const commandInput = $('#commandPaletteInput');
  const commandList = $('#commandPaletteList');
  
  // Sidebar lists
  const openFilesList = $('#openFilesList'), recentFilesList = $('#recentFilesList');

  let autoRunTimer;
  // Variáveis para rastrear sugestões da IA
  let pendingAiLine = null;
  let pendingAiEditor = null;

  // Função Utilitária para Debounce
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const STORAGE_KEY = 'dx_studio_code_v1';
  const THEME_KEY = 'dx_studio_theme';
  const FONT_SIZE_KEY = 'dx_studio_font_size';
  const DEVICE_KEY = 'dx_studio_device';
  const ZOOM_KEY = 'dx_studio_zoom';
  const CONSOLE_TIME_KEY = 'dx_studio_console_time';
  const AUTO_CLEAR_KEY = 'dx_studio_auto_clear';
  const SNAPSHOT_TIMER_KEY = 'dx_studio_snapshot_timer';
  const CDN_KEY = 'dx_studio_cdns';
  const HISTORY_KEY = 'dx_studio_history_v1';
  const RECENT_FILES_KEY = 'dx_studio_recent_files';
  const EXPLORER_WIDTH_KEY = 'dx_studio_explorer_width';
  const PANELS_FLEX_KEY = 'dx_studio_panels_flex';
  const CONSOLE_HEIGHT_KEY = 'dx_studio_console_height';
  const TABBAR_HEIGHT_KEY = 'dx_studio_tabbar_height';
  const TERMINAL_HEIGHT_KEY = 'dx_studio_terminal_height';
  const TAB_WIDTHS_KEY = 'dx_studio_tab_widths';
  const TAB_ORDER_KEY = 'dx_studio_tab_order'; // Nova chave para a ordem das abas
  const TERMINAL_HISTORY_KEY = 'dx_studio_terminal_history';

  let errorNavigationList = [];
  let currentErrorIndex = -1;
  let lastLogEntry = null; // { payloadStr, type, element, count, badge }
  let terminalHistory = JSON.parse(localStorage.getItem(TERMINAL_HISTORY_KEY) || '[]');
  let terminalHistoryIndex = terminalHistory.length;
  let lastSnapshotDataURL = null; // Armazena o último snapshot para exportação
  let lastJsOffset = 0;
  let highlightedLines = [];

  // Variáveis para o Minimap
  let minimapInst = null;
  
  function initMinimap() {
    const minimapEl = $('#minimap');
    if (!minimapEl) return;
    
    // Cria o elemento visual do destaque (viewport slider)
    const slider = document.createElement('div');
    slider.id = 'minimap-slider';
    slider.className = 'minimap-view-slider';
    minimapEl.appendChild(slider);

    // Torna o Minimap clicável para navegar no código
    minimapEl.addEventListener('mousedown', (e) => {
      // Pega o editor ativo no momento do clique
      let activeCM = null;
      if (modeSelect?.value === 'single') {
        activeCM = editor;
      } else {
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) activeCM = editors[activeTab.dataset.mode];
      }

      if (!activeCM || !minimapInst) return;

      const handleMove = (moveEvent) => {
        const rect = minimapEl.getBoundingClientRect();
        const clickY = moveEvent.clientY - rect.top;
        
        const info = activeCM.getScrollInfo();
        const mInfo = minimapInst.getScrollInfo();
        
        // Calcula a escala entre o editor e o minimapa
        const scale = mInfo.height / info.height;
        
        // Calcula o novo scroll, tentando centralizar a viewport no clique
        const targetScrollTop = (clickY + mInfo.top) / scale - (info.clientHeight / 2);
        
        activeCM.scrollTo(null, targetScrollTop);
      };

      handleMove(e); // Executa no clique inicial

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    });

    minimapInst = CodeMirror(minimapEl, {
      mode: 'htmlmixed',
      theme: currentTheme,
      readOnly: true,
      lineNumbers: false,
      foldGutter: false,
      gutters: [],
      scrollbarStyle: 'null',
      lineWrapping: false
    });
    
    syncMinimap();
  }

  function syncMinimap() {
    if (!minimapInst) return;
    
    // Pega o editor ativo no momento
    let activeCM = null;
    if (modeSelect?.value === 'single') {
      activeCM = editor;
    } else {
      const activeTab = document.querySelector('.tab.active');
      if (activeTab) {
        const mode = activeTab.dataset.mode;
        activeCM = editors[mode];
      }
    }

    if (activeCM && typeof activeCM.getValue === 'function') {
      // REQUISITO: Ocultar Minimap se tiver menos de 20 linhas
      const lineCount = activeCM.lineCount();
      const minimapEl = $('#minimap');
      if (lineCount < 20) {
        if (minimapEl) minimapEl.style.display = 'none';
        return;
      } else {
        if (minimapEl) minimapEl.style.display = 'block';
      }

      minimapInst.setOption('mode', activeCM.getOption('mode'));
      minimapInst.setValue(activeCM.getValue());
      
      // Sincroniza o Scroll e o Destaque Retangular
      const scrollSync = () => {
        const info = activeCM.getScrollInfo();
        const height = info.height - info.clientHeight;
        const ratio = height > 0 ? info.top / height : 0;
        const mInfo = minimapInst.getScrollInfo();
        
        const mScrollTop = ratio * (mInfo.height - mInfo.clientHeight);
        minimapInst.scrollTo(0, mScrollTop);

        // Atualiza o destaque retangular
        const slider = $('#minimap-slider');
        if (slider) {
          // Calcula a escala entre o editor real e o minimapa
          const scale = mInfo.height / info.height;
          
          // Altura do slider proporcional à área visível do editor
          slider.style.height = (info.clientHeight * scale) + 'px';
          
          // Posição ajustada descontando o scroll do próprio minimapa
          slider.style.top = (info.top * scale - mScrollTop) + 'px';
        }

        // Gerencia efeito de fade-out
        minimapEl.classList.toggle('scrolled-top', mInfo.top > 10);
        minimapEl.classList.toggle('scrolled-bottom', mInfo.top + mInfo.clientHeight < mInfo.height - 10);

        // REQUISITO: Desenhar Marcadores de Erros/Avisos
        minimapEl.querySelectorAll('.minimap-marker').forEach(m => m.remove());
        if (errorNavigationList.length > 0 && activeCM) {
          errorNavigationList.forEach(err => {
            // Verifica se o erro pertence ao editor atualmente visível
            if (err.editor === activeCM) {
              const marker = document.createElement('div');
              marker.className = `minimap-marker ${err.type}`;
              // O cálculo 'err.line * 4' baseia-se no line-height de 4px definido no CSS do minimap
              marker.style.top = (err.line * 4 - mInfo.top) + 'px';
              minimapEl.appendChild(marker);
            }
          });
        }
      };

      // Limpa listeners antigos para evitar duplicação ao trocar de abas
      activeCM.off('scroll', activeCM._minimapSync);
      activeCM._minimapSync = scrollSync;
      activeCM.on('scroll', scrollSync);
      activeCM.on('change', () => minimapInst.setValue(activeCM.getValue()));
    }
  }

  const defaultSnippets = {
    htmlmixed: `<!-- DX Studio: HTML -->\n<h1>Olá Mundo!</h1>\n<p>Edite o código e clique em <b>Run</b>.</p>\n` ,
    css: `/* DX Studio: CSS */\nbody {\n  font-family: system-ui;\n  padding: 20px;\n  background: #0b1020;\n  color: #eaeaff;\n}\n.box { padding: 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 12px; }\n` ,
    javascript: `// DX Studio: JavaScript\nconsole.log('JS rodando no iframe!');\n\n// exemplo\ndocument.body.style.background = '#0b1020';\ndocument.body.style.color = '#eaeaff';\n` ,
    php: `<?php\necho "Olá do PHP!";\n?>`,
    python: `print("Olá do Python!")`
  };

  const editorEl = document.getElementById('editor');
  const fileEditorsWrap = document.getElementById('fileEditors');

  // Cria 3 editores (HTML/CSS/JS) para quando estiver em “Arquivos (HTML/CSS/JS)”.
  const editorHtml = document.getElementById('editorHtml');
  const editorCss = document.getElementById('editorCss');
  const editorJs = document.getElementById('editorJs');
  const editorPhp = document.getElementById('editorPhp');
  const editorPy = document.getElementById('editorPy');
  const editorSettings = document.getElementById('editorSettings');

  // Garante que o painel de visualização exista
  if (!edPanel || !prePanel) console.warn("DX Studio: Painéis principais não encontrados.");

  let currentTheme = localStorage.getItem(THEME_KEY) || 'dracula';
  let currentFontSize = localStorage.getItem(FONT_SIZE_KEY) || '14px';
  let showTimestamps = localStorage.getItem(CONSOLE_TIME_KEY) !== 'off';
  let autoClearConsole = localStorage.getItem(AUTO_CLEAR_KEY) !== 'off';
  let snapshotTimerSeconds = parseInt(localStorage.getItem(SNAPSHOT_TIMER_KEY) || '3');
  let recentFiles = JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || '[]');
  let currentCdns = localStorage.getItem(CDN_KEY) || '';
  let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

  // Variáveis globais para drag and drop
  let draggedTab = null;
  let draggedEditorPanel = null;

  function createEditor(el, initial, mode, gutters = ['CodeMirror-linenumbers']){
    const inst = CodeMirror(el, {
      value: initial,
      mode,
      theme: currentTheme,
      lineNumbers: true,
      tabSize: 2,
      indentUnit: 2,
      lineWrapping: true,
      extraKeys: {"Ctrl-Space": "autocomplete"},
      gutters: gutters // Adiciona a opção de gutters
    });

    // Auto-complete ao digitar (IntelliSense básico)
    inst.on("inputRead", (cm, change) => {
      if (change.origin !== "+input") return;
      const cur = cm.getCursor();
      const token = cm.getTokenAt(cur);
      if (token.type && token.type !== "comment" && change.text[0] !== " ") {
          cm.showHint({ 
            completeSingle: false,
            // Tenta encontrar o hinter específico da linguagem
            hint: mode === 'javascript' ? CodeMirror.hint.javascript : 
                  (mode === 'css' ? CodeMirror.hint.css : CodeMirror.hint.anyword)
          });
      }
    });

    return inst;
  }

  function getBreakpoints() {
    const lines = [];
    if (!editorJsInstance) return lines;
    for (let i = 0; i < editorJsInstance.lineCount(); i++) {
      const info = editorJsInstance.lineInfo(i);
      if (info.gutterMarkers && info.gutterMarkers.breakpoints) {
        lines.push(i);
      }
    }
    return lines;
  }

  function applySearchHighlight(container, term) {
    if (!term) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
      const text = node.nodeValue;
      const lowerText = text.toLowerCase();
      const lowerTerm = term.toLowerCase();
      if (lowerText.includes(lowerTerm)) {
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;
        let idx = lowerText.indexOf(lowerTerm);
        while (idx !== -1) {
          fragment.appendChild(document.createTextNode(text.substring(lastIdx, idx)));
          const b = document.createElement('b');
          b.className = 'search-highlight';
          b.textContent = text.substring(idx, idx + term.length);
          fragment.appendChild(b);
          lastIdx = idx + term.length;
          idx = lowerText.indexOf(lowerTerm, lastIdx);
        }
        fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
        node.parentNode.replaceChild(fragment, node);
      }
    });
  }

  function clearSearchHighlight(container) {
    const highlights = container.querySelectorAll('.search-highlight');
    highlights.forEach(h => {
      h.parentNode.replaceChild(document.createTextNode(h.textContent), h);
    });
    container.normalize();
  }

  // Editor único (fallback)
  const editor = editorEl ? createEditor(
    editorEl,
    localStorage.getItem(STORAGE_KEY) ?? defaultSnippets.htmlmixed,
    'htmlmixed'
  ) : null;

  // Editores em layout
  const editorHtmlInstance = editorHtml ? createEditor(
    editorHtml,
    localStorage.getItem(STORAGE_KEY + ':html') ?? defaultSnippets.htmlmixed,
    'htmlmixed'
  ) : null;

  const editorCssInstance = editorCss ? createEditor(
    editorCss,
    localStorage.getItem(STORAGE_KEY + ':css') ?? defaultSnippets.css,
    'css'
  ) : null;

  const editorJsInstance = editorJs ? createEditor(
    editorJs,
    localStorage.getItem(STORAGE_KEY + ':js') ?? defaultSnippets.javascript,
    'javascript',
    ['CodeMirror-linenumbers', 'breakpoints', 'error-gutter'] // Adiciona gutters no editor JS
  ) : null;

  const editorPhpInstance = editorPhp ? createEditor(
    editorPhp,
    localStorage.getItem(STORAGE_KEY + ':php') ?? defaultSnippets.php,
    'application/x-httpd-php'
  ) : null;

  const editorPyInstance = editorPy ? createEditor(
    editorPy,
    localStorage.getItem(STORAGE_KEY + ':python') ?? defaultSnippets.python,
    'python'
  ) : null;

  // Mapeamento necessário para funções como clearAll e switchTab
  const editors = {
    htmlmixed: editorHtmlInstance,
    css: editorCssInstance,
    javascript: editorJsInstance,
    php: editorPhpInstance,
    python: editorPyInstance,
    settings: editorSettings
  };

  // Filtra apenas instâncias reais do CodeMirror para evitar erros em elementos DOM (como o settings)
  let editorInstances = [];
  function updateEditorInstancesList() {
    editorInstances = Object.values(editors).concat(editor).filter(inst => inst && typeof inst.setOption === 'function');
  }
  updateEditorInstancesList();

  function setStatus(msg){
    if (statusText) statusText.textContent = msg;
  }

  function makeBreakpointMarker() {
    const marker = document.createElement("div");
    marker.className = "cm-breakpoint";
    marker.innerHTML = "●";
    return marker;
  }

  function filterConsoleEntries() {
    const term = consoleSearchInput ? consoleSearchInput.value.toLowerCase() : '';
    const entries = consoleEl.querySelectorAll('.console-entry');
    entries.forEach(entry => {
      clearSearchHighlight(entry);
      const text = entry.innerText.toLowerCase();
      const matchesSearch = text.includes(term);
      // Se não houver termo, remove o estilo inline para respeitar o filtro de tipo do CSS
      if (!term) {
        entry.style.display = '';
      } else {
        if (matchesSearch) {
          entry.style.display = '';
          applySearchHighlight(entry, term);
        } else {
          entry.style.display = 'none';
        }
      }
    });
  }

  function clearErrorHighlights() {
    highlightedLines.forEach(item => {
      item.editor.removeLineClass(item.line, 'background', 'error-line-highlight');
      item.editor.setGutterMarker(item.line, 'error-gutter', null);
    });
    highlightedLines = [];
    syncMinimap(); // Atualiza o minimap para remover os marcadores visuais
  }

  function highlightLine(editor, line, type = 'error') {
    if (!editor) return;
    clearErrorHighlights();
    
    const bgClass = type === 'error' ? 'error-line-highlight' : 'warn-line-highlight';
    const gutterClass = type === 'error' ? 'cm-error-gutter-marker' : 'cm-warn-gutter-marker';
    const icon = type === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle';

    editor.addLineClass(line, 'background', bgClass);
    
    const marker = document.createElement('div');
    marker.className = gutterClass;
    marker.innerHTML = `<i class="fas ${icon}"></i>`;
    editor.setGutterMarker(line, 'error-gutter', marker);
    
    highlightedLines.push({ editor, line });
    editor.scrollIntoView({ line, ch: 0 }, 200);
    syncMinimap(); // Força a atualização dos marcadores no minimap
  }

  // Lógica do Terminal Integrado
  function appendTerminal(msg, type = '') {
    if (!terminalOutput) return;
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.textContent = msg;
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function processTerminalCommand(cmd) {
    const input = cmd.trim().toLowerCase();
    if (!input) return;

    appendTerminal(`> ${cmd}`, 'info');
    const parts = input.split(' ');
    const command = parts[0];

    switch(command) {
      case 'help':
        appendTerminal('Comandos disponíveis:');
        appendTerminal('  run     - Executa o projeto atual');
        appendTerminal('  save    - Salva o projeto no localStorage');
        appendTerminal('  clear   - Limpa as mensagens do terminal');
        appendTerminal('  format  - Formata o código do arquivo ativo');
        appendTerminal('  cls     - Atalho para limpar');
        break;
      case 'run':
        run();
        appendTerminal('Executando...', 'success');
        break;
      case 'save':
        save();
        appendTerminal('Projeto salvo com sucesso!', 'success');
        break;
      case 'clear':
      case 'cls':
        terminalOutput.innerHTML = '';
        break;
      case 'format':
        formatCode();
        appendTerminal('Código formatado.', 'success');
        break;
      default:
        appendTerminal(`Comando não reconhecido: '${command}'. Digite 'help' para ajuda.`, 'error');
    }
  }

  let consoleCounts = { log: 0, warn: 0, error: 0 };

  function updateConsoleCountersUI() {
    const logEl = $('#count-log');
    const warnEl = $('#count-warn');
    const errorEl = $('#count-error');
    if (logEl) logEl.textContent = consoleCounts.log;
    if (warnEl) warnEl.textContent = consoleCounts.warn;
    if (errorEl) errorEl.textContent = consoleCounts.error;
  }

  function createObjectTree(obj) {
    const container = document.createElement('div');
    container.className = 'json-tree';
    
    function build(data, isRoot = false) {
      if (typeof data !== 'object' || data === null) {
        const span = document.createElement('span');
        span.className = 'json-val';
        span.textContent = typeof data === 'string' ? `"${data}"` : String(data);
        return span;
      }

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = Array.isArray(data) ? `Array(${data.length})` : `Object { ... }`;
      details.appendChild(summary);

      for (const key in data) {
        const row = document.createElement('div');
        row.style.marginLeft = '12px';
        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = `${key}: `;
        row.appendChild(keySpan);
        row.appendChild(build(data[key]));
        details.appendChild(row);
      }
      return details;
    }

    container.appendChild(build(obj, true));
    return container;
  }

  function getEditorPanelIdFromMode(mode) {
    return {
      'htmlmixed': 'editorHtml',
      'css': 'editorCss',
      'javascript': 'editorJs',
      'php': 'editorPhp',
      'python': 'editorPy',
      'settings': 'editorSettings'
    }[mode];
  }

  function handleDragStart(e) {
    draggedTab = this;
    const mode = this.dataset.mode;
    const editorPanelId = getEditorPanelIdFromMode(mode);
    draggedEditorPanel = document.getElementById(editorPanelId);

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', mode); // Armazena o modo para potencial uso futuro
    this.classList.add('dragging');
  }

  function handleDragOver(e) {
    e.preventDefault(); // Necessário para permitir o drop
    e.dataTransfer.dropEffect = 'move';

    if (this === draggedTab || !this.classList.contains('tab')) {
      return;
    }

    const rect = this.getBoundingClientRect();
    const x = e.clientX;
    const insertBefore = (x < rect.left + rect.width / 2);

    // Remove indicadores de drop existentes
    document.querySelectorAll('.tab.drop-target-left, .tab.drop-target-right').forEach(t => {
      t.classList.remove('drop-target-left', 'drop-target-right');
    });

    if (insertBefore) {
      this.classList.add('drop-target-left');
    } else {
      this.classList.add('drop-target-right');
    }
  }

  function handleDragLeave(e) {
    this.classList.remove('drop-target-left', 'drop-target-right');
  }

  function handleDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.tab.drop-target-left, .tab.drop-target-right').forEach(t => {
      t.classList.remove('drop-target-left', 'drop-target-right');
    });

    if (draggedTab && this !== draggedTab && this.classList.contains('tab')) {
      const targetTab = this;
      const targetMode = targetTab.dataset.mode;
      const targetEditorPanelId = getEditorPanelIdFromMode(targetMode);
      const targetEditorPanel = document.getElementById(targetEditorPanelId);

      const rect = targetTab.getBoundingClientRect();
      const x = e.clientX;
      const insertBefore = (x < rect.left + rect.width / 2);

      if (insertBefore) {
        targetTab.parentNode.insertBefore(draggedTab, targetTab);
        fileEditorsWrap.insertBefore(draggedEditorPanel, targetEditorPanel);
      } else {
        targetTab.parentNode.insertBefore(draggedTab, targetTab.nextSibling);
        fileEditorsWrap.insertBefore(draggedEditorPanel, targetEditorPanel.nextSibling);
      }
    }
  }

  function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.tab.drop-target-left, .tab.drop-target-right').forEach(t => {
      t.classList.remove('drop-target-left', 'drop-target-right');
    });
    draggedTab = null;
    draggedEditorPanel = null;
    saveLayout(); // Salva a nova ordem das abas após o drop
  }

  function toggleSidebar(forceOpen = false) {
    const sidebar = $('#sidebar');
    if (!sidebar) return;

    const currentWidth = sidebar.offsetWidth;
    if (currentWidth > 0 && !forceOpen) { // Sidebar está aberta, vamos fechar
      localStorage.setItem(EXPLORER_WIDTH_KEY, sidebar.style.width || '200px');
      sidebar.style.width = '0px';
      if (resizerS) resizerS.style.display = 'none'; // Esconde o resizer
      document.querySelectorAll('.activity-bar i').forEach(i => i.classList.remove('active'));
    } else { // Sidebar está fechada, vamos abrir
      const lastWidth = localStorage.getItem(EXPLORER_WIDTH_KEY) || '200px';
      sidebar.style.width = lastWidth;
      if (resizerS) resizerS.style.display = 'block'; // Mostra o resizer
    }
    saveLayout();
    // Força os editores a recalcularem o tamanho para evitar bugs de clique/seleção
    editorInstances.forEach(inst => inst.refresh());
  }

  // Lógica de Redimensionamento Horizontal
  resizerH?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizingH = true;
    document.body.style.cursor = 'col-resize';
  });

  // Lógica de Redimensionamento Vertical (Console)
  resizerV?.addEventListener('mousedown', () => isResizingV = true);

  // Lógica de Redimensionamento do Terminal
  resizerTerminal?.addEventListener('mousedown', () => isResizingTerminal = true);

  // Lógica de Redimensionamento da Sidebar
  resizerS?.addEventListener('mousedown', () => isResizingSidebar = true);

  // Lógica de Redimensionamento da Barra de Abas
  tabBarResizerV?.addEventListener('mousedown', (e) => { e.stopPropagation(); isResizingTabBar = true; });

  window.addEventListener('mousemove', (e) => {
    if (isResizingH) {
      const layoutRect = $('.layout').getBoundingClientRect();
      const sidebarWidth = ($('#sidebar')?.offsetWidth || 0) + 50; // Sidebar + ActivityBar
      
      const availableWidth = layoutRect.width - sidebarWidth;
      const mousePosInLayout = e.clientX - layoutRect.left - sidebarWidth;
      
      let percentage = (mousePosInLayout / availableWidth) * 2;

      if (percentage < 0.05) percentage = 0;
      if (percentage > 1.95) percentage = 2;
      if (edPanel && prePanel) {
        edPanel.style.flex = percentage;
        prePanel.style.flex = 2 - percentage;
      }
    }
    if (isResizingSidebar) {
      const newWidth = e.clientX - $('.activity-bar').clientWidth;
      // Snap para ocultar
      if (newWidth < 30) $('#sidebar').style.width = '0px';
      else $('#sidebar').style.width = `${Math.min(Math.max(0, newWidth), 400)}px`;
    }
    if (isResizingV) {
      const panelHeight = $('.previewPanel').clientHeight;
      let consoleHeight = panelHeight - (e.clientY - $('.previewPanel').getBoundingClientRect().top);
      // Snap para minimizar console
      if (consoleHeight < 40) consoleHeight = 40; 
      consoleEl.style.maxHeight = `${Math.max(50, consoleHeight - 40)}px`;
    }
    if (isResizingTerminal) {
      const panelRect = edPanel.getBoundingClientRect();
      let terminalHeight = panelRect.bottom - e.clientY - $('#statusbar').offsetHeight;
      if (terminalHeight < 30) terminalHeight = 0;
      $('#terminalWrap').style.height = `${Math.max(0, terminalHeight)}px`;
    }
    if (isResizingTabBar) {
      const newHeight = e.clientY - $('#tabBar').getBoundingClientRect().top;
      $('#tabBar').style.height = `${Math.min(Math.max(35, newHeight), 100)}px`;
    }
    // Redimensionamento de largura de aba individual
    if (isResizingTabWidth && activeTabResizing) {
      const rect = activeTabResizing.getBoundingClientRect();
      let newWidth;
      if (resizeSide === 'right') {
        newWidth = e.clientX - rect.left;
      } else {
        newWidth = rect.right - e.clientX;
      }
      activeTabResizing.style.width = `${Math.min(Math.max(80, newWidth), 400)}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizingH || isResizingV || isResizingTabBar || isResizingSidebar || isResizingTabWidth || isResizingTerminal) {
      saveLayout();
      // Força os editores a recalcularem o tamanho para evitar bugs de clique/seleção
      editorInstances.forEach(inst => inst.refresh());
    }
    isResizingH = false;
    isResizingV = false;
    isResizingTabBar = false;
    isResizingSidebar = false;
    isResizingTerminal = false;
    isResizingTabWidth = false;
    activeTabResizing = null;
    document.body.style.cursor = 'default';
  });

  // Menu de Contexto das Abas
  let contextTargetTab = null;
  function setupContextMenu() {
    if (!contextMenu) return;
    window.addEventListener('click', () => {
      contextMenu.style.display = 'none';
    });
    
    $('#menuCloseOthers')?.addEventListener('click', () => {
      if (!contextTargetTab) return;
      const modeToKeep = contextTargetTab.getAttribute('data-mode');
      document.querySelectorAll('.tab').forEach(t => {
        const m = t.getAttribute('data-mode');
        if (m !== modeToKeep && m !== 'settings') {
          if (t.style.display !== 'none') t.querySelector('.close-tab')?.click();
        }
      });
    });

    // Adiciona a opção "Fechar Aba" ao menu de contexto
    $('#menuCloseTab')?.addEventListener('click', () => {
      if (!contextTargetTab) return;
      const closeButton = contextTargetTab.querySelector('.close-tab');
      if (closeButton) {
        closeButton.click();
      } else {
        // Se for uma aba sem botão de fechar (ex: settings), apenas esconde
        contextTargetTab.style.display = 'none';
      }
    });

    $('#menuCloseAll')?.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => {
        const m = t.getAttribute('data-mode');
        if (m !== 'settings') {
          if (t.style.display !== 'none') t.querySelector('.close-tab')?.click();
        }
      });
    });
  }
  setupContextMenu();

  function toggleAllObjects() {
    const details = consoleEl.querySelectorAll('details');
    if (details.length === 0) return;
    
    const isAnyOpen = Array.from(details).some(d => d.open);
    details.forEach(d => d.open = !isAnyOpen);
    showToast(isAnyOpen ? 'Objetos recolhidos' : 'Objetos expandidos');
  }

  // Função para formatar links e agora também links de linha de erro
  function formatLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const fragment = document.createDocumentFragment();
    const parts = text.split(urlRegex);

    parts.forEach(part => {
      if (part.match(urlRegex)) {
        const a = document.createElement('a');
        a.href = part;
        a.target = '_blank';
        a.className = 'console-link';
        a.textContent = part;
        fragment.appendChild(a);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    return fragment;
  }

  // Nova função para formatar partes da mensagem do console, incluindo links de linha de erro
  function formatConsoleMessagePart(item, type, actualJsLineForError, targetEditor) {
    const fragment = document.createDocumentFragment();
    let msgStr = String(item);
    const lineRegex = /linha (\d+)/;
    const match = msgStr.match(lineRegex);

    if (type === 'error' && actualJsLineForError !== null && match && targetEditor) {
      const [pre, post] = msgStr.split(match[0]);
      
      if (pre) fragment.appendChild(formatLinks(pre));
      
      const lineLink = document.createElement('a');
      lineLink.className = 'console-error-line-link';
      lineLink.textContent = match[0];
      lineLink.style.cursor = 'pointer';
      lineLink.onclick = (e) => {
        e.preventDefault();
        highlightLine(targetEditor, actualJsLineForError - 1);
      };
      fragment.appendChild(lineLink);
      
      if (post) fragment.appendChild(formatLinks(post));
    } else {
      fragment.appendChild(formatLinks(msgStr));
    }
    return fragment;
  }

  function navigateErrors(direction) {
    if (errorNavigationList.length === 0) {
      showToast("Nenhum erro ou aviso detectado.");
      return;
    }
    currentErrorIndex += direction;
    if (currentErrorIndex >= errorNavigationList.length) currentErrorIndex = 0;
    if (currentErrorIndex < 0) currentErrorIndex = errorNavigationList.length - 1;

    const err = errorNavigationList[currentErrorIndex];
    highlightLine(err.editor, err.line, err.type);
    showToast(`Navegando: ${currentErrorIndex + 1} de ${errorNavigationList.length} (${err.type.toUpperCase()})`);
  }

  function appendConsole(payload, type = 'log', actualJsLineForError = null, targetEditor = null){
    const payloadStr = JSON.stringify(payload);

    // Agrupamento de mensagens repetidas
    if (lastLogEntry && lastLogEntry.type === type && lastLogEntry.payloadStr === payloadStr) {
      lastLogEntry.count++;
      if (!lastLogEntry.badge) {
        lastLogEntry.badge = document.createElement('span');
        lastLogEntry.badge.className = 'badge-count log console-entry-repeat';
        lastLogEntry.element.appendChild(lastLogEntry.badge);
      }
      lastLogEntry.badge.textContent = lastLogEntry.count;
      consoleEl.scrollTop = consoleEl.scrollHeight;
      return;
    }

    // Aplicar filtro de busca imediatamente se houver termo
    const term = consoleSearchInput ? consoleSearchInput.value.toLowerCase() : '';
    if (term && !payload.join(' ').toLowerCase().includes(term)) {
      // O entry ainda não foi criado, mas isso previne poluição visual se necessário
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const entry = document.createElement('div');
    entry.className = `console-entry ${type}`;
    
    if (showTimestamps) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'console-time';
      timeSpan.textContent = `[${timeStr}]`;
      entry.appendChild(timeSpan);
    }
    
    payload.forEach(item => {
      if (item && typeof item === 'object' && item.__dxObj) {
        entry.appendChild(createObjectTree(item.data));
      } else {
        // Identifica se é um code frame (trecho de código com erro/aviso)
        if (typeof item === 'string' && item.includes('>')) {
          const codeSpan = document.createElement('code');
          codeSpan.className = 'console-code-frame';
          codeSpan.textContent = item.trim();
          entry.appendChild(codeSpan);
        } else {
          const textSpan = document.createElement('span');
          textSpan.appendChild(formatConsoleMessagePart(item, type, actualJsLineForError, targetEditor));
          entry.appendChild(textSpan);
        }
      }
    });

    // Se for um erro, adiciona o botão de "Corrigir com IA"
    if (type === 'error') {
      const fixBtn = document.createElement('button');
      fixBtn.className = 'btn tiny primary';
      fixBtn.style.marginLeft = '10px';
      fixBtn.style.padding = '2px 8px';
      fixBtn.innerHTML = '<i class="fas fa-magic"></i> Corrigir';
      fixBtn.onclick = () => fixErrorWithAi(payload.join(' '));
      entry.appendChild(fixBtn);
    }

    consoleEl.appendChild(entry);
    consoleEl.scrollTop = consoleEl.scrollHeight;

    // Esconder se não bater com a busca atual
    if (term && !entry.innerText.toLowerCase().includes(term)) {
      entry.style.display = 'none';
    } else if (term) {
      applySearchHighlight(entry, term);
    }

    lastLogEntry = { payloadStr, type, element: entry, count: 1, badge: null };

    // Incrementa contadores globais
    if (type in consoleCounts) {
      consoleCounts[type]++;
      updateConsoleCountersUI();
    }
  }

  function clearConsole(){
    consoleEl.textContent = '';
    consoleEl.classList.remove('expanded');
    consoleCounts = { log: 0, warn: 0, error: 0 };
    errorNavigationList = [];
    currentErrorIndex = -1;
    lastLogEntry = null;
    updateConsoleCountersUI();
  }

  function toggleConsole() {
    const isMinimized = consoleEl.classList.toggle('minimized');
    consoleEl.classList.remove('expanded'); // Reset do estado de erro ao interagir manualmente
    
    const icon = toggleConsoleBtn?.querySelector('i');
    if (icon) icon.className = isMinimized ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
  }

  function saveLayout() {
    const sidebar = $('#sidebar');
    const tabBar = $('#tabBar');
    
    if (sidebar) localStorage.setItem(EXPLORER_WIDTH_KEY, sidebar.style.width);
    localStorage.setItem(PANELS_FLEX_KEY, JSON.stringify({
      editor: $('.editorPanel').style.flex,
      preview: $('.previewPanel').style.flex
    }));
    if (consoleEl) localStorage.setItem(CONSOLE_HEIGHT_KEY, consoleEl.style.maxHeight);
    if (tabBar) localStorage.setItem(TABBAR_HEIGHT_KEY, tabBar.style.height);
    const terminalWrap = $('#terminalWrap');
    if (terminalWrap) localStorage.setItem(TERMINAL_HEIGHT_KEY, terminalWrap.style.height);
    
    // Salva a ordem atual das abas
    const currentTabOrder = [];
    document.querySelectorAll('.tab').forEach(tab => {
      // Exclui o botão de adicionar aba da ordem persistente
      if (tab.id !== 'addTabBtn') currentTabOrder.push(tab.dataset.mode);
    });
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(currentTabOrder));

    // Salva larguras individuais das abas
    const widths = {};
    document.querySelectorAll('.tab').forEach(t => {
      if (t.style.width) widths[t.getAttribute('data-mode')] = t.style.width;
    });
    localStorage.setItem(TAB_WIDTHS_KEY, JSON.stringify(widths));
  }

  function toggleSidebar() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    const currentWidth = sidebar.offsetWidth;
    if (currentWidth > 0) {
      localStorage.setItem('dx_studio_last_sidebar_width', sidebar.style.width || '200px');
      sidebar.style.width = '0px';
    } else {
      const lastWidth = localStorage.getItem('dx_studio_last_sidebar_width') || '200px';
      sidebar.style.width = lastWidth;
    }
    saveLayout();
  }

  function resetLayout() {
    if (edPanel) edPanel.style.flex = "1.2";
    if (prePanel) prePanel.style.flex = "0.9";
    $('#sidebar').style.width = "200px";
    $('#tabBar').style.height = "40px";
    consoleEl.style.maxHeight = "180px";
    // Limpa larguras individuais das abas
    document.querySelectorAll('.tab').forEach(t => t.style.width = '');
    saveLayout();
    showToast('Layout redefinido!');
  }

  function resetToFactorySettings() {
    if (confirm("ATENÇÃO: Isso apagará todas as suas configurações e códigos salvos. Deseja continuar?")) {
      const keysToRemove = [STORAGE_KEY, THEME_KEY, FONT_SIZE_KEY, DEVICE_KEY, ZOOM_KEY, CONSOLE_TIME_KEY, AUTO_CLEAR_KEY, SNAPSHOT_TIMER_KEY, CDN_KEY, HISTORY_KEY];
      keysToRemove.forEach(k => localStorage.removeItem(k));
      // Remove chaves compostas
      Object.keys(localStorage).forEach(k => { if(k.startsWith(STORAGE_KEY)) localStorage.removeItem(k); });
      location.reload();
    }
  }

  function exportConsoleLogs() {
    const logs = consoleEl.innerText;
    if (!logs.trim()) {
      showToast('O console está vazio.');
      return;
    }
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dx_studio_console_${new Date().getTime()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Logs exportados.');
  }

  async function takeSnapshot() {
    if (typeof html2canvas === 'undefined') {
      setStatus('Erro: html2canvas não carregado.');
      return;
    }

    // 1. Timer dinâmico antes da captura
    if (snapshotTimerSeconds > 0) {
      for (let i = snapshotTimerSeconds; i > 0; i--) {
        showToast(`Preparar... Snapshot em ${i}s`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setStatus('Capturando snapshot...');
    try {
      const target = previewFrame; // Captura o iframe diretamente para incluir suas bordas e estilos de dispositivo

      // Efeito visual de flash
      if (flashEffect) {
        flashEffect.classList.add('show');
        await new Promise(resolve => setTimeout(resolve, 100)); // Duração do flash
        flashEffect.classList.remove('show');
      }

      const canvas = await html2canvas(target, {
        backgroundColor: null,
        logging: false,
        useCORS: true,
        scale: window.devicePixelRatio || 2 // Melhora a qualidade
      });

      // Efeito sonoro do obturador
      if (shutterSound) shutterSound.play().catch(() => {});

      lastSnapshotDataURL = canvas.toDataURL('image/png'); // Armazena o snapshot

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `dx-snapshot-${new Date().getTime()}.png`;
      link.click();
      
      setStatus('Snapshot salvo!');
      showToast('Câmera: PNG capturado!');
    } catch (e) {
      console.error(e);
      setStatus('Erro ao capturar snapshot.');
    }
  }

  function toggleFullScreen() {
    const wrap = $('.iframeWrap');
    if (!document.fullscreenElement) {
      wrap.requestFullscreen().catch(err => {
        showToast(`Erro ao entrar em tela cheia: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function getCdnTags() {
    return currentCdns.split('\n').filter(url => url.trim()).map(url => {
      const trimmed = url.trim();
      if (trimmed.endsWith('.css')) return `<link rel="stylesheet" href="${trimmed}">`;
      return `<script src="${trimmed}"></script>`;
    }).join('\n');
  }

  function buildPreviewDocument(jsOverride){
    let html, css, js;

    if (modeSelect.value === 'single' && editor) {
      html = editor.getValue();
      css = '';
      js = '';
    } else {
      html = editorHtmlInstance.getValue();
      css = editorCssInstance.getValue();
      js = jsOverride !== undefined ? jsOverride : (editorJsInstance ? editorJsInstance.getValue() : '');
    }

    const cdnTags = getCdnTags();

    const cssLines = css.split('\n').length;
    const cdnLineCount = cdnTags ? cdnTags.split('\n').length : 0;

    if (modeSelect.value === 'single') {
      // No modo single, o código do usuário (HTML) começa após o head e tags iniciais
      lastJsOffset = 9 + cdnLineCount;
    } else {
      const htmlLines = html.split('\n').length;
      // No modo arquivos, o JS começa após CSS, HTML e boilerplates
      // O valor 13 compensa as tags estruturais injetadas
      lastJsOffset = 13 + cssLines + htmlLines + cdnLineCount;
    }

    return [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8" />',
      '<style>', css, '</style>',
      cdnTags,
      '</head>',
      '<body>',
      html,
      '<script>', js, '<\/script>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  function run(){
    if (autoClearConsole) clearConsole();
    clearErrorHighlights();
    errorNavigationList = [];
    currentErrorIndex = -1;
    setStatus('Rodando...');
    runBtn?.classList.add('loading');
    
    // Minimiza o console automaticamente ao rodar (será reaberto se houver erro)
    consoleEl.classList.add('minimized');
    const icon = toggleConsoleBtn?.querySelector('i');
    if (icon) icon.className = 'fas fa-chevron-up';

    // Capturar breakpoints e injetar debugger
    const breakpoints = getBreakpoints();
    let jsCode = editorJsInstance ? editorJsInstance.getValue() : '';
    if (breakpoints.length > 0) {
      const lines = jsCode.split('\n');
      breakpoints.forEach(idx => {
        lines[idx] = `debugger; ${lines[idx]}`;
      });
      jsCode = lines.join('\n');
    }

    const previewHTML = buildPreviewDocument(jsCode);

    // Captura de console dentro do iframe
    // (Aproveita interceptando console.* no documento carregado.)
    const instrumented = previewHTML.replace(
      '<head>',
      `<head>\n<script>(function(){\n  const _log = console.log.bind(console);\n  const _warn = console.warn.bind(console);\n  const _err = console.error.bind(console);\n\n  function getLoc() {\n    try { throw new Error(); } catch(e) {\n      const parts = e.stack.split('\\n');\n      const caller = parts[3];\n      const match = caller ? caller.match(/:(\\d+):(\\d+)\\)?$/) : null;\n      return match ? ' (linha ' + match[1] + ')' : '';\n    }\n  }\n\n  function post(type, args){\n    try{\n      const payload = Array.from(args).map(a => {\n        if (typeof a === 'object' && a !== null) {\n          try { return { __dxObj: true, data: JSON.parse(JSON.stringify(a)) }; }\n          catch(e) { return String(a); }\n        }\n        return String(a);\n      });\n      parent.postMessage({__dxStudioConsole:true, type, payload}, '*');\n    }catch(e){}\n  }\n\n  window.onerror = function(msg, url, line, col, error) {\n    post('error', [msg + ' (linha ' + line + ')']);\n    return false;\n  };\n\n  console.log = function(){ post('log', arguments); _log.apply(console, arguments); };\n  console.warn = function(){ \n    const args = Array.from(arguments);\n    args[0] = args[0] + getLoc();\n    post('warn', args); \n    _warn.apply(console, arguments); \n  };\n  console.error = function(){ \n    const args = Array.from(arguments);\n    args[0] = args[0] + getLoc();\n    post('error', args); \n    _err.apply(console, arguments); \n  };\n})();<\/script>`
    );

    // Recarrega srcdoc
    previewFrame.srcdoc = instrumented;

    // Status
    setStatus('Rodando (use a aba Console para ver logs).');
    setTimeout(() => runBtn?.classList.remove('loading'), 600);
  }

  // Autosave com debounce refinado
  const debouncedPersistence = debounce(() => {
    save(true);
    if (autosaveStatus) {
      autosaveStatus.classList.add('active');
      setTimeout(() => autosaveStatus.classList.remove('active'), 1500);
    }
  }, 2000); // Persiste a cada 2 segundos de inatividade

  function triggerAutoRun() {
    clearTimeout(autoRunTimer);
    autoRunTimer = setTimeout(() => {
      run();
    }, 1000); // Aguarda 1 segundo após parar de digitar
  }

  async function copy(){
    try{
      const code = editor ? editor.getValue() : (editorHtmlInstance?.getValue() || '');
      await navigator.clipboard.writeText(code);
      setStatus('Código copiado.');
    }catch{
      // fallback
      editor.focus();
      editor.setSelection({line:0,ch:0}, {line:editor.lineCount(), ch:0});
      document.execCommand('copy');
      setStatus('Código copiado.');
    }
  }

  function switchTab(mode) {
    if (!fileEditorsWrap) return;

    // Atualiza classes das abas
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.tab[data-mode="${mode}"]`);
    if (activeTab) activeTab.classList.add('active');

    // Esconde todos os editores e ativa o correto
    const allEditors = document.querySelectorAll('.fileEditors .singleEditor');
    allEditors.forEach(ed => {
      ed.classList.remove('active');
      ed.style.display = 'none';
    });

    const targetId = {
      'htmlmixed': 'editorHtml', 'css': 'editorCss', 'javascript': 'editorJs',
      'php': 'editorPhp', 'python': 'editorPy', 'settings': 'editorSettings'
    }[mode] || mode; // Fallback para IDs dinâmicos

    const targetEditor = document.getElementById(targetId);
    if (targetEditor) {
      targetEditor.classList.add('active');
      targetEditor.style.display = 'block';
      // Força o CodeMirror a se redimensionar corretamente
      setTimeout(() => {
        const inst = editors[mode];
        if (inst && typeof inst.refresh === 'function') inst.refresh();
        if (mode === 'settings') updateSettingsUI();
      }, 10);
    }
    
    setStatus(`Editando: ${mode.toUpperCase()}`);
    updateRecentFiles(mode);
    updateSidebarFileList();
    syncMinimap(); // Sincroniza o minimap ao trocar de aba
  }

  function updateSidebarFileList() {
    if (!openFilesList) return;
    openFilesList.innerHTML = '';

    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      if (tab.style.display === 'none') return;

      const mode = tab.getAttribute('data-mode');
      const isActive = tab.classList.contains('active');
      const icon = tab.querySelector('i').cloneNode(true);
      const fileName = tab.textContent.trim();

      const item = document.createElement('div');
      item.className = `open-file-item ${isActive ? 'active' : ''}`;
      item.appendChild(icon);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = fileName;
      item.appendChild(nameSpan);
      
      item.onclick = () => switchTab(mode);
      openFilesList.appendChild(item);
    });
  }

  function updateRecentFiles(mode) {
    if (mode === 'settings') return;
    recentFiles = recentFiles.filter(m => m !== mode);
    recentFiles.unshift(mode);
    if (recentFiles.length > 5) recentFiles.pop();
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recentFiles));
    renderRecentFiles();
  }

  function renderRecentFiles() {
    if (!recentFilesList) return;
    recentFilesList.innerHTML = '';
    const searchTerm = sidebarSearchInput ? sidebarSearchInput.value.toLowerCase() : '';
    
    recentFiles.forEach(mode => {
      const tab = document.querySelector(`.tab[data-mode="${mode}"]`);
      if (!tab) return;
      
      const icon = tab.querySelector('i').cloneNode(true);
      const fileName = tab.textContent.trim();

      // Lógica de filtro da pesquisa (Corrigindo funcionalidade quebrada)
      if (searchTerm && !fileName.toLowerCase().includes(searchTerm)) {
        return;
      }
      
      const item = document.createElement('div');
      item.className = 'open-file-item';
      item.appendChild(icon);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = fileName;
      item.appendChild(nameSpan);
      
      item.onclick = () => switchTab(mode);
      recentFilesList.appendChild(item);
    });
  }

  function togglePreviewToolbar() {
    $('.previewPanel').classList.toggle('preview-controls-hidden');
    showToast("Barra de ferramentas alternada");
  }

  function setPreviewVisible(visible) {
    const layoutEl = $('.layout');
    if (visible && layoutEl) {
      layoutEl.classList.remove('preview-closed');
      if (openPreviewBtn) openPreviewBtn.style.display = 'none';
      // Força redimensionamento para evitar CodeMirror bugado
      setTimeout(() => {
        editorHtmlInstance?.refresh();
        editorJsInstance?.refresh();
      }, 100);
    } else if (layoutEl) {
      layoutEl.classList.add('preview-closed');
      if (openPreviewBtn) openPreviewBtn.style.display = 'block';
    }
    saveLayout();
  }

  function save(isAutosave = false){
    if (modeSelect.value === 'single' && editor) {
      localStorage.setItem(STORAGE_KEY, editor.getValue());
    }
    localStorage.setItem(STORAGE_KEY + ':html', editorHtmlInstance.getValue());
    localStorage.setItem(STORAGE_KEY + ':css', editorCssInstance.getValue());
    localStorage.setItem(STORAGE_KEY + ':js', editorJsInstance.getValue());
    localStorage.setItem(STORAGE_KEY + ':php', editorPhpInstance?.getValue());
    localStorage.setItem(STORAGE_KEY + ':python', editorPyInstance?.getValue());
    addHistoryVersion();

    if (isAutosave && autosaveStatus) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      autosaveStatus.setAttribute('title', `Último salvamento automático: ${timeStr}`);
    }

    if (!isAutosave) setStatus('Salvo no navegador (localStorage).');
  }

  function clearAll(){
    let editorToClear = null;
    let modeOfEditorToClear = null;
    const isSingle = modeSelect.value === 'single';

    // Verifica se estamos no modo multi-editor e encontra o editor ativo
    const activeTabElement = document.querySelector('.tab.active');
    if (!isSingle && activeTabElement) {
      modeOfEditorToClear = activeTabElement.getAttribute('data-mode');
      if (modeOfEditorToClear === 'settings') { 
        clearConsole(); 
        return; 
      }
      editorToClear = editors[modeOfEditorToClear];
    } else if (isSingle && editor) { // Fallback para o modo de editor único
      editorToClear = editor;
      modeOfEditorToClear = 'htmlmixed'; // Usa o snippet padrão de HTML para o modo single
    }

    if (editorToClear && modeOfEditorToClear) {
      const snippet = defaultSnippets[modeOfEditorToClear] ?? '';
      editorToClear.setValue(snippet);
      setStatus('Editor limpo.');
      save(); // Salva o estado limpo
    } else {
      setStatus('Nenhum editor ativo para limpar.');
    }
    clearConsole();
  }

  async function formatCode() {
    let activeEditorInstance = null;
    let activeMode = null;

    // Verifica se estamos no modo Single ou Multi-arquivos
    if (modeSelect?.value === 'single') {
      activeEditorInstance = editor;
      activeMode = 'htmlmixed';
    } else {
      const activeTabElement = document.querySelector('.tab.active');
      activeMode = activeTabElement ? activeTabElement.getAttribute('data-mode') : null;

      if (activeMode === 'htmlmixed') activeEditorInstance = editorHtmlInstance;
      else if (activeMode === 'css') activeEditorInstance = editorCssInstance;
      else if (activeMode === 'javascript') activeEditorInstance = editorJsInstance;
    }

    if (!activeEditorInstance || !activeMode) {
      setStatus('Nenhum editor ativo ou modo não suportado para formatação.');
      return;
    }

    const originalCode = activeEditorInstance.getValue();
    const indentSize = activeEditorInstance.getOption('indentUnit');
    let formattedCode = originalCode;

    try {
      if (activeMode === 'htmlmixed' && typeof html_beautify !== 'undefined') formattedCode = html_beautify(originalCode, { indent_size: indentSize });
      else if (activeMode === 'css' && typeof css_beautify !== 'undefined') formattedCode = css_beautify(originalCode, { indent_size: indentSize });
      else if (activeMode === 'javascript' && typeof js_beautify !== 'undefined') formattedCode = js_beautify(originalCode, { indent_size: indentSize });
      else { setStatus(`Formatação para ${activeMode.toUpperCase()} não suportada.`); return; }

      if (formattedCode && formattedCode !== originalCode) activeEditorInstance.setValue(formattedCode);
      setStatus('Código formatado com sucesso!');
    } catch (e) { setStatus(`Erro ao formatar: ${e.message}`); console.error('Erro de formatação:', e); }
  }

  function updateSettingsUI() {
    if (themeSelect) themeSelect.value = currentTheme;
    if (fontSizeSelect) fontSizeSelect.value = currentFontSize;
    if (consoleTimeSelect) consoleTimeSelect.value = showTimestamps ? 'on' : 'off';
    if (autoClearSelect) autoClearSelect.value = autoClearConsole ? 'on' : 'off';
    if (snapshotTimerSelect) snapshotTimerSelect.value = snapshotTimerSeconds.toString();
    if (cdnInput) cdnInput.value = currentCdns;
    updateStorageUsage();
    renderHistoryUI();
  }

  function changeTheme(newTheme) {
    currentTheme = newTheme;
    localStorage.setItem(THEME_KEY, newTheme);
    
    // Atualiza o atributo de dados para o console mudar de cor via CSS
    if (consoleWrap) consoleWrap.setAttribute('data-theme', newTheme);

    editorInstances.forEach(inst => {
      if (inst) inst.setOption('theme', newTheme);
    });
    
    if (editor) editor.setOption('theme', newTheme);
    
    setStatus(`Tema alterado para: ${newTheme}`);
  }

  function changeFontSize(newSize) {
    currentFontSize = newSize;
    localStorage.setItem(FONT_SIZE_KEY, newSize);
    
    // Aplica a variável CSS na raiz do documento
    document.documentElement.style.setProperty('--editor-font-size', newSize);
    
    // Força o CodeMirror a recalcular o layout para evitar bugs visuais nas linhas
    editorInstances.forEach(inst => inst?.refresh());
    
    setStatus(`Fonte alterada para: ${newSize}`);
  }

  function updateStorageUsage() {
    if (!storageBar || !storageText) return;
    
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += (localStorage[key].length + key.length) * 2; // Estima 2 bytes por char (UTF-16)
      }
    }

    const limit = 5 * 1024 * 1024; // Padrão comum de 5MB
    const percentage = Math.min((total / limit) * 100, 100);
    const kbUsed = (total / 1024).toFixed(1);

    storageBar.style.width = `${percentage}%`;
    storageText.textContent = `${percentage.toFixed(1)}% (${kbUsed} KB / 5120 KB)`;

    // Cores de alerta
    storageBar.className = 'storage-bar';
    if (percentage > 85) storageBar.classList.add('critical');
    else if (percentage > 60) storageBar.classList.add('warning');
  }

  function toggleConsoleTimestamps(value) {
    showTimestamps = value === 'on';
    localStorage.setItem(CONSOLE_TIME_KEY, value);
    setStatus(`Timestamps do console: ${showTimestamps ? 'LIGADOS' : 'DESLIGADOS'}`);
  }

  function changeSnapshotTimer(value) {
    snapshotTimerSeconds = parseInt(value);
    localStorage.setItem(SNAPSHOT_TIMER_KEY, value);
    setStatus(`Timer do snapshot alterado para: ${value}s`);
  }

  function updateCDNs(value) {
    currentCdns = value;
    localStorage.setItem(CDN_KEY, value);
    setStatus('Bibliotecas externas atualizadas.');
  }

  function renderHistoryUI() {
    if (!historyList) return;
    historyList.innerHTML = history.length ? '' : '<div class="hint">Nenhuma versão salva ainda.</div>';
    history.forEach((item, idx) => {
      const date = new Date(item.timestamp).toLocaleString();
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <span>${date}</span>
        <button class="btn tiny" onclick="window.restoreVersion(${idx})">Restaurar</button>
      `;
      historyList.appendChild(div);
    });
  }

  window.restoreVersion = (idx) => {
    const version = history[idx];
    if (!version) return;
    editorHtmlInstance.setValue(version.html);
    editorCssInstance.setValue(version.css);
    editorJsInstance.setValue(version.js);
    if (editorPhpInstance) editorPhpInstance.setValue(version.php || '');
    if (editorPyInstance) editorPyInstance.setValue(version.py || '');
    showToast('Versão restaurada com sucesso!');
    run();
  };

  function addHistoryVersion() {
    const isSingle = modeSelect.value === 'single';
    const html = isSingle ? editor.getValue() : editorHtmlInstance.getValue();
    const css = isSingle ? '' : editorCssInstance.getValue();
    const js = isSingle ? '' : editorJsInstance.getValue();
    const last = history[0];
    
    // Evita duplicatas idênticas
    if (last && last.html === html && last.css === css && last.js === js) return;

    history.unshift({
      timestamp: Date.now(),
      html, css, js,
      php: editorPhpInstance?.getValue(),
      py: editorPyInstance?.getValue()
    });
    
    if (history.length > 20) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function updateResolutionIndicator() {
    if (!previewFrame || !resIndicator) return;
    const style = getComputedStyle(previewFrame);
    const w = Math.round(parseFloat(style.width));
    const h = Math.round(parseFloat(style.height));
    resIndicator.textContent = `${w}×${h}`;

    if (w < 320) {
      resIndicator.classList.add('critical');
    } else {
      resIndicator.classList.remove('critical');
    }
  }

  function changeDevice(device, save = true) {
    previewFrame.className = device;
    if (deviceSelect) deviceSelect.value = device;
    if (save) localStorage.setItem(DEVICE_KEY, device);
    updateResolutionIndicator();
    setStatus(`Visualização: ${device.toUpperCase()}`);
  }

  function toggleOrientation() {
    previewFrame.classList.toggle('landscape');
    updateResolutionIndicator();
    setStatus(`Orientação: ${previewFrame.classList.contains('landscape') ? 'PAISAGEM' : 'RETRATO'}`);
  }

  function applyZoom(value, save = true) {
    previewFrame.style.setProperty('--preview-zoom', value);
    if (zoomRange) zoomRange.value = value;
    if (save) localStorage.setItem(ZOOM_KEY, value);
    setStatus(`Zoom: ${Math.round(value * 100)}%`);
  }

  let toastTimer;
  function showToast(msg, actionText = null, actionFn = null) {
    if (!toastEl) return;
    toastEl.innerHTML = `<span>${msg}</span>`;
    
    if (actionText && actionFn) {
      const btn = document.createElement('button');
      btn.className = 'btn tiny primary';
      btn.style.marginLeft = '15px';
      btn.style.background = 'rgba(255,255,255,0.2)';
      btn.textContent = actionText;
      btn.onclick = (e) => {
        e.stopPropagation();
        actionFn();
        toastEl.classList.remove('show');
      };
      toastEl.appendChild(btn);
    }

    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2000);
  }

  function fitToScreen() {
    const container = $('.iframeWrap');
    if (!container || !previewFrame) return;

    const padding = 60; // Margem de segurança
    const containerW = container.clientWidth - padding;
    const containerH = container.clientHeight - padding;

    // Usamos getComputedStyle para obter as dimensões alvo (alinhadas ao CSS) 
    // independente de transições de escala ou tamanho em andamento.
    const style = getComputedStyle(previewFrame);
    const realW = parseFloat(style.width);
    const realH = parseFloat(style.height);

    const scale = Math.min(containerW / realW, containerH / realH, 1.5);
    applyZoom(scale.toFixed(2));
  }

  async function exportProject() {
    if (typeof JSZip === 'undefined') {
      setStatus('Erro: Biblioteca JSZip não carregada.');
      return;
    }
    
    setStatus('Gerando ZIP...');
    const zip = new JSZip();

    // Exporta dinamicamente todos os arquivos abertos no sistema
    Object.keys(editors).forEach(mode => {
      const inst = editors[mode];
      if (inst && typeof inst.getValue === 'function') {
        // Obtém o nome real do arquivo a partir da aba correspondente
        const tab = document.querySelector(`.tab[data-mode="${mode}"]`);
        const fileName = tab ? tab.textContent.trim() : `${mode}.txt`;
        zip.file(fileName, inst.getValue());
      }
    });

    // Adiciona o último snapshot ao ZIP, se existir
    if (lastSnapshotDataURL) {
      const base64Data = lastSnapshotDataURL.split(',')[1];
      const snapshotFileName = `snapshots/snapshot_${new Date().getTime()}.png`;
      zip.file(snapshotFileName, base64Data, { base64: true });
      setStatus('Projeto e snapshot exportados!');
    }

    const content = await zip.generateAsync({type:"blob"});
    // Usa o FileSaver (saveAs) ou fallback de link
    if (window.saveAs) {
      saveAs(content, "projeto_dx_studio.zip");
    } else {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = "projeto_dx_studio.zip";
      link.click();
    }
    setStatus('Projeto exportado!');
  }

  // Eventos
  runBtn?.addEventListener('click', run);
  saveBtn?.addEventListener('click', save);
  copyBtn?.addEventListener('click', copy);
  clearBtn?.addEventListener('click', clearAll);
  toggleConsoleBtn?.addEventListener('click', toggleConsole);
  snapshotBtn?.addEventListener('click', takeSnapshot);
  toggleAllObjectsBtn?.addEventListener('click', toggleAllObjects);
  fullscreenBtn?.addEventListener('click', toggleFullScreen);
  exportConsoleBtn?.addEventListener('click', exportConsoleLogs);
  clearConsoleBtn?.addEventListener('click', clearConsole);
  prettierBtn?.addEventListener('click', formatCode); // Evento para o botão Prettier
  
  saveNowBtn?.addEventListener('click', () => {
    save();
    updateStorageUsage();
    saveNowBtn.classList.add('btn-success');
    const originalText = saveNowBtn.textContent;
    saveNowBtn.textContent = 'Projeto Salvo!';
    setTimeout(() => {
      saveNowBtn.classList.remove('btn-success');
      saveNowBtn.textContent = originalText;
    }, 1500);
  });

  exportBtn?.addEventListener('click', exportProject);
  resetLayoutBtn?.addEventListener('click', resetLayout);
  resetFactoryBtn?.addEventListener('click', resetToFactorySettings);

  // SISTEMA DE COMMAND PALETTE
  const commands = [
    { id: 'run', label: 'Executar Projeto', icon: 'fa-play', action: run, shortcut: 'Ctrl+Enter' },
    { id: 'save', label: 'Salvar Projeto', icon: 'fa-save', action: save, shortcut: 'Ctrl+S' },
    { id: 'format', label: 'Formatar Código (Prettier)', icon: 'fa-magic', action: formatCode, shortcut: 'Ctrl+Shift+F' },
    { id: 'export', label: 'Exportar Projeto (ZIP)', icon: 'fa-file-archive', action: exportProject, shortcut: '' },
    { id: 'clear', label: 'Limpar Console', icon: 'fa-trash', action: clearConsole, shortcut: 'Ctrl+L' },
    { id: 'snapshot', label: 'Capturar Snapshot', icon: 'fa-camera', action: takeSnapshot, shortcut: 'Ctrl+P' },
    { id: 'sidebar', label: 'Alternar Barra Lateral', icon: 'fa-columns', action: toggleSidebar, shortcut: 'Ctrl+B' },
    { id: 'console', label: 'Alternar Console', icon: 'fa-terminal', action: toggleConsole, shortcut: '' },
    { id: 'reset', label: 'Resetar Layout', icon: 'fa-sync-alt', action: resetLayout, shortcut: '' },
    { id: 'settings', label: 'Abrir Configurações', icon: 'fa-cog', action: () => switchTab('settings'), shortcut: '' }
  ];

  let selectedCommandIndex = 0;
  let filteredCommands = [];

  function openCommandPalette() {
    commandPalette?.classList.add('active');
    commandInput?.focus();
    commandInput.value = '';
    renderCommands();
  }

  function closeCommandPalette() {
    commandPalette?.classList.remove('active');
    // Retorna o foco para o editor ativo
    editorInstances.forEach(inst => { if (inst.hasFocus()) inst.focus(); });
  }

  function renderCommands() {
    const query = commandInput.value.toLowerCase();
    filteredCommands = commands.filter(c => c.label.toLowerCase().includes(query));
    
    if (selectedCommandIndex >= filteredCommands.length) selectedCommandIndex = 0;

    commandList.innerHTML = '';
    filteredCommands.forEach((cmd, idx) => {
      const item = document.createElement('div');
      item.className = `command-item ${idx === selectedCommandIndex ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="command-label"><i class="fas ${cmd.icon}"></i> ${cmd.label}</div>
        ${cmd.shortcut ? `<span class="command-shortcut">${cmd.shortcut}</span>` : ''}
      `;
      item.onclick = () => executeCommand(cmd);
      commandList.appendChild(item);
      if (idx === selectedCommandIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }

  function executeCommand(cmd) {
    cmd.action();
    closeCommandPalette();
    showToast(`Executado: ${cmd.label}`);
  }

  commandInput?.addEventListener('input', () => {
    selectedCommandIndex = 0;
    renderCommands();
  });

  commandInput?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
      renderCommands();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
      renderCommands();
    } else if (e.key === 'Enter') {
      if (filteredCommands[selectedCommandIndex]) {
        executeCommand(filteredCommands[selectedCommandIndex]);
      }
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });

  terminalInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = terminalInput.value.trim();
      if (cmd) {
        // Adiciona ao histórico se for diferente do último comando para evitar duplicatas seguidas
        if (terminalHistory[terminalHistory.length - 1] !== cmd) {
          terminalHistory.push(cmd);
          if (terminalHistory.length > 50) terminalHistory.shift(); // Limita a 50 entradas
          localStorage.setItem(TERMINAL_HISTORY_KEY, JSON.stringify(terminalHistory));
        }
        terminalHistoryIndex = terminalHistory.length;
      }
      processTerminalCommand(cmd);
      terminalInput.value = '';
    } else if (e.key === 'ArrowUp') {
      if (terminalHistory.length > 0 && terminalHistoryIndex > 0) {
        e.preventDefault();
        terminalHistoryIndex--;
        terminalInput.value = terminalHistory[terminalHistoryIndex];
        // Move o cursor para o final do texto
        setTimeout(() => terminalInput.setSelectionRange(terminalInput.value.length, terminalInput.value.length), 0);
      }
    } else if (e.key === 'ArrowDown') {
      if (terminalHistoryIndex < terminalHistory.length - 1) {
        e.preventDefault();
        terminalHistoryIndex++;
        terminalInput.value = terminalHistory[terminalHistoryIndex];
      } else if (terminalHistoryIndex === terminalHistory.length - 1) {
        e.preventDefault();
        terminalHistoryIndex = terminalHistory.length;
        terminalInput.value = '';
      }
    }
  });

  // Fecha a paleta ao clicar fora
  commandPalette?.addEventListener('click', (e) => {
    if (e.target === commandPalette) closeCommandPalette();
  });

  sidebarSearchInput?.addEventListener('input', updateSidebarFileList);
  togglePreviewToolbarBtn?.addEventListener('click', togglePreviewToolbar);
  closePreviewBtn?.addEventListener('click', () => setPreviewVisible(false));
  openPreviewBtn?.addEventListener('click', () => setPreviewVisible(true));

  // Ativa o Auto-run para HTML, CSS e JS
  [editorHtmlInstance, editorCssInstance, editorJsInstance, editor].forEach(inst => {
    inst?.on('change', () => {
      setStatus('Editando...');
      clearErrorHighlights();
      debouncedPersistence(); // Salva no storage silenciosamente
      triggerAutoRun();
    });
  });

  themeSelect?.addEventListener('change', (e) => {
    changeTheme(e.target.value);
  });

  fontSizeSelect?.addEventListener('change', (e) => {
    changeFontSize(e.target.value);
  });

  consoleSearchInput?.addEventListener('input', () => {
    filterConsoleEntries();
  });

  consoleTimeSelect?.addEventListener('change', (e) => {
    toggleConsoleTimestamps(e.target.value);
  });

  autoClearSelect?.addEventListener('change', (e) => {
    autoClearConsole = e.target.value === 'on';
    localStorage.setItem(AUTO_CLEAR_KEY, e.target.value);
    setStatus(`Limpeza automática: ${autoClearConsole ? 'LIGADA' : 'DESLIGADA'}`);
  });

  snapshotTimerSelect?.addEventListener('change', (e) => {
    changeSnapshotTimer(e.target.value);
  });

  cdnInput?.addEventListener('input', debounce((e) => {
    updateCDNs(e.target.value);
  }, 500));

  consoleFilterSelect?.addEventListener('change', (e) => {
    const filter = e.target.value;
    consoleEl.className = `console filter-${filter}`;
    setStatus(`Filtro do console: ${filter.toUpperCase()}`);
  });

  deviceSelect?.addEventListener('change', (e) => {
    changeDevice(e.target.value);
    // O setTimeout garante que o navegador processe a troca de classe antes do cálculo
    setTimeout(fitToScreen, 0);
  });

  zoomRange?.addEventListener('input', (e) => {
    applyZoom(e.target.value);
  });

  orientationBtn?.addEventListener('click', () => {
    toggleOrientation();
  });

  fitBtn?.addEventListener('click', () => {
    fitToScreen();
  });

  resetZoomBtn?.addEventListener('click', () => {
    applyZoom(1);
  });

  function initTabEvents(tab) {
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.close-tab')) {
        e.stopPropagation();
        const mode = tab.getAttribute('data-mode');
        if (confirm(`Deseja fechar ${mode}?`)) {
          tab.style.display = 'none';
          const targetId = {
            'htmlmixed': 'editorHtml', 'css': 'editorCss', 'javascript': 'editorJs',
            'php': 'editorPhp', 'python': 'editorPy', 'settings': 'editorSettings'
          }[mode];
          document.getElementById(targetId).style.display = 'none';
          setStatus(`Aba ${mode} fechada.`);
          updateSidebarFileList();
        }
        return;
      }
      switchTab(tab.getAttribute('data-mode'));
    });

    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextTargetTab = tab;
      contextMenu.style.display = 'block';
      contextMenu.style.left = `${e.pageX}px`;
      contextMenu.style.top = `${e.pageY}px`;
    });

    // Alça DIREITA
    const resizerR = document.createElement('div');
    resizerR.className = 'tab-resizer-h';
    resizerR.title = "Arraste para esticar";
    resizerR.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizingTabWidth = true;
      activeTabResizing = tab;
      resizeSide = 'right';
      document.body.style.cursor = 'col-resize';
    });
    tab.appendChild(resizerR);

    // Alça ESQUERDA
    const resizerL = document.createElement('div');
    resizerL.className = 'tab-resizer-l';
    resizerL.title = "Arraste para esticar";
    resizerL.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizingTabWidth = true;
      activeTabResizing = tab;
      resizeSide = 'left';
      document.body.style.cursor = 'col-resize';
    });
    tab.appendChild(resizerL);

    tab.addEventListener('dragstart', handleDragStart);
    tab.addEventListener('dragover', handleDragOver);
    tab.addEventListener('dragleave', handleDragLeave);
    tab.addEventListener('drop', handleDrop);
    tab.addEventListener('dragend', handleDragEnd);

    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchTab(tab.getAttribute('data-mode'));
      }
    });
  }

  // Inicializa abas existentes
  document.querySelectorAll('.tab').forEach(initTabEvents);

  addTabBtn?.addEventListener('click', () => {
    const fileName = prompt("Nome do arquivo (ex: script2.js):");
    if (!fileName || fileName.trim() === "") return;

    const ext = fileName.split('.').pop().toLowerCase();
    const modeMap = { 
      'html': 'htmlmixed', 'htm': 'htmlmixed',
      'css': 'css', 'js': 'javascript', 
      'php': 'application/x-httpd-php', 'py': 'python' 
    };
    const mode = modeMap[ext] || 'javascript';
    const fileId = 'dynamic_' + Date.now();

    // 1. Criar a Aba no DOM
    const newTab = document.createElement('div');
    newTab.className = 'tab';
    newTab.dataset.mode = fileId;
    
    const iconClass = {
      'htmlmixed': 'fab fa-html5', 'css': 'fab fa-css3-alt', 'javascript': 'fab fa-js',
      'application/x-httpd-php': 'fab fa-php', 'python': 'fab fa-python'
    }[mode] || 'fas fa-file-code';

    newTab.innerHTML = `<i class="${iconClass}"></i> ${fileName} <i class="fas fa-times close-tab"></i>`;
    addTabBtn.parentNode.insertBefore(newTab, addTabBtn);

    // 2. Criar o Container do Editor
    const newEditorDiv = document.createElement('div');
    newEditorDiv.id = fileId;
    newEditorDiv.className = 'editor singleEditor';
    fileEditorsWrap.appendChild(newEditorDiv);

    // 3. Inicializar CodeMirror
    const snippet = defaultSnippets[ext === 'js' ? 'javascript' : (ext === 'html' ? 'htmlmixed' : ext)] || '';
    const inst = createEditor(newEditorDiv, snippet, mode);
    editors[fileId] = inst;

    // 4. Registrar Eventos e Atualizar
    initTabEvents(newTab);
    updateEditorInstancesList();
    switchTab(fileId);
    updateSidebarFileList();
    showToast(`Arquivo "${fileName}" criado!`);
  });

  // Garante que todos os editores tenham o comando de busca
  editorInstances.forEach(inst => {
    if (inst) {
      inst.setOption("extraKeys", {
        ...inst.getOption("extraKeys"),
        "Ctrl-F": "findPersistent",
        "Cmd-F": "findPersistent",
        "Ctrl-G": "jumpToLine",
        "Cmd-G": "jumpToLine"
      });
    }

    // Suporte a breakpoints visuais na calha do editor JS
    if (inst && inst === editorJsInstance) {
      inst.on("gutterClick", (cm, n) => {
        const info = cm.lineInfo(n);
        cm.setGutterMarker(n, "breakpoints", info.gutterMarkers && info.gutterMarkers.breakpoints ? null : makeBreakpointMarker());
        showToast(`Breakpoint ${info.gutterMarkers && info.gutterMarkers.breakpoints ? 'removido' : 'adicionado'} na linha ${n + 1}`);
      });
    }
  });

  modeSelect?.addEventListener('change', () => {
    const nextMode = modeSelect.value;

    if (nextMode === 'single') {
      if (editorEl) editorEl.style.display = 'block';
      if (fileEditorsWrap) fileEditorsWrap.style.display = 'none';
      if ($('#tabBar')) $('#tabBar').style.display = 'none';
      setTimeout(() => editor?.refresh(), 50);
    } else {
      if (editorEl) editorEl.style.display = 'none';
      if (fileEditorsWrap) fileEditorsWrap.style.display = 'flex';
      if ($('#tabBar')) $('#tabBar').style.display = 'flex';
      setTimeout(() => editorHtmlInstance?.refresh(), 50);

      // Garante que a aba ativa seja processada ao retornar para o modo multi-arquivos
      const activeTab = $('.tab.active');
      if (activeTab) switchTab(activeTab.getAttribute('data-mode'));
    }
    setStatus(`Modo: ${nextMode}.`);
  });

  // Ativa os ícones da Activity Bar (Barra Lateral Esquerda) e gerencia a sidebar
  document.querySelectorAll('.activity-bar i').forEach(icon => {
    icon.addEventListener('click', () => {
      const title = icon.title;
      const sidebar = document.getElementById('sidebar');
      const explorerView = $('#view-explorer');
      const aiView = $('#view-ai');
      const isSidebarOpen = sidebar.offsetWidth > 0;
      const isActive = icon.classList.contains('active');

      // Se clicar no ícone que já está ativo e a sidebar estiver aberta, fecha
      if (isActive && isSidebarOpen) {
        toggleSidebar();
        return;
      }

      // Lógica de troca de telas para funcionalidades implementadas
      if (title === 'Explorador' || title === 'IA Assistant') {
        document.querySelectorAll('.activity-bar i').forEach(i => i.classList.remove('active'));
        icon.classList.add('active');

        if (title === 'Explorador') {
          explorerView.style.display = 'block';
          if ($('#ai-sidebar')) $('#ai-sidebar').style.display = 'none';
        } else {
          explorerView.style.display = 'none';
          if ($('#ai-sidebar')) $('#ai-sidebar').style.display = 'block';
          const key = aiApiKey?.value.trim();
          if (key && aiModelSelect && aiModelSelect.options.length <= 1) carregarModelos(key);
        }

        // Abre a sidebar apenas se ela estiver fechada
        if (!isSidebarOpen) toggleSidebar(true);
      } else {
        // Telas não implementadas
        showToast(`${title}: Em desenvolvimento...`);
      }
      
      editorInstances.forEach(inst => inst.refresh());
    });
  });

  // Lógica do DX AI Assistant
  const aiChatHistory = $('#chat-messages');
  const aiChatInput = $('#aiChatInput');
  const sendAiBtn = $('#sendAiBtn');
  const toggleAiConfig = $('#toggleAiConfig');
  const aiConfigPanel = $('#aiConfigPanel');
  const aiApiKey = $('#aiApiKey');
  const verifyAiKeyBtn = $('#verifyAiKeyBtn');
  const aiModelSelect = $('#aiModelSelect');
  const aiModelSelectorContainer = $('#aiModelSelectorContainer');
  const newAiChatBtn = $('#newAiChatBtn');
  const showAiHistoryBtn = $('#showAiHistoryBtn');
  const aiHistoryPanel = $('#aiHistoryPanel');
  const aiHistoryList = $('#aiHistoryList');
  const importChatInput = $('#importChatInput');
  
  // Modal de Diff
  const diffModal = $('#diffModal');
  const confirmDiffBtn = $('#confirmDiffBtn');
  const cancelDiffBtn = $('#cancelDiffBtn');
  const closeDiffBtn = $('#closeDiffBtn');

  const AI_MODEL_KEY = 'dx_studio_ai_model';
  const AI_CHATS_KEY = 'dx_studio_ai_saved_chats';
  let aiConversationHistory = []; // Histórico para conversas contínuas
  let currentChatId = Date.now();
  let isAiLoadingModels = false; // Trava de estado para evitar flood

  // Carrega a API Key salva ao iniciar
  if (aiApiKey) {
    aiApiKey.value = localStorage.getItem('dx_studio_ai_key') || '';
  }

  // Salva a API Key automaticamente ao digitar
  aiApiKey?.addEventListener('input', (e) => {
    localStorage.setItem('dx_studio_ai_key', e.target.value);
  });

  toggleAiConfig?.addEventListener('click', () => {
    aiConfigPanel.classList.toggle('hidden');
  });

  async function carregarModelos(apiKey) {
    if (isAiLoadingModels || !aiModelSelect) return;

    isAiLoadingModels = true;
    if (verifyAiKeyBtn) {
      verifyAiKeyBtn.disabled = true;
      verifyAiKeyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    aiModelSelect.innerHTML = '<option value="">Carregando...</option>';

    // Usamos v1beta para listar uma gama maior de modelos disponíveis para a chave
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        showToast(`Erro na API: ${data.error.message}`);
        aiModelSelect.innerHTML = '<option>Erro: Chave Inválida</option>';
        return;
      }

      // Filtra todos os modelos que sejam da família Gemini para garantir compatibilidade
      const modelosValidos = (data.models || [])
        .filter(m => 
          m.name?.includes('gemini') || 
          m.supportedMethods?.some(method => method.includes('generateContent'))
        )
        .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

      if (modelosValidos.length === 0) {
        aiModelSelect.innerHTML = '<option value="">Nenhum modelo compatível encontrado</option>';
        return;
      }

      aiModelSelect.innerHTML = '<option value="">Selecione um modelo</option>';

      modelosValidos.forEach(m => {
        const option = document.createElement('option');
        option.value = m.name; 
        option.textContent = m.displayName;
        aiModelSelect.appendChild(option);
      });

      const savedModel = localStorage.getItem(AI_MODEL_KEY);
      if (savedModel && Array.from(aiModelSelect.options).some(o => o.value === savedModel)) {
        aiModelSelect.value = savedModel;
      }
      
      aiModelSelectorContainer?.classList.remove('hidden');
      const aiStatusEl = $('.ai-status-text');
      if (aiStatusEl) aiStatusEl.textContent = aiModelSelect.options[aiModelSelect.selectedIndex]?.text || 'Conectado';
      showToast("Modelos carregados com sucesso!");
    } catch (error) {
      aiModelSelect.innerHTML = '<option value="">Erro de conexão</option>';
      console.error("Erro ao listar modelos:", error);
      showToast("Falha ao conectar com a API do Gemini.");
    } finally {
      isAiLoadingModels = false;
      if (verifyAiKeyBtn) {
        verifyAiKeyBtn.disabled = false;
        verifyAiKeyBtn.textContent = 'Verificar';
      }
    }
  }

  verifyAiKeyBtn?.addEventListener('click', () => {
    const key = aiApiKey?.value.trim();
    if (key) carregarModelos(key);
    else showToast("Insira uma chave antes de verificar.");
  });

  aiModelSelect?.addEventListener('change', () => {
    localStorage.setItem(AI_MODEL_KEY, aiModelSelect.value);
    const statusText = $('.ai-status-text');
    if (statusText) statusText.textContent = aiModelSelect.options[aiModelSelect.selectedIndex].text;
    showToast("Modelo alterado!");
  });

  // Função para salvar o chat atual no histórico
  function saveChatToHistory() {
    if (aiConversationHistory.length === 0) return;
    
    let chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
    let currentChat = chats.find(c => c.id === currentChatId);
    
    if (!currentChat) {
      const firstMsg = aiConversationHistory.find(m => m.role === 'user')?.text || 'Nova Conversa';
      const title = firstMsg.substring(0, 35) + (firstMsg.length > 35 ? '...' : '');
      
      currentChat = {
        id: currentChatId,
        timestamp: Date.now(),
        title: title,
        messages: aiConversationHistory
      };
      chats.unshift(currentChat);
    } else {
      currentChat.messages = aiConversationHistory;
      currentChat.timestamp = Date.now();
      // Move para o topo
      chats = [currentChat, ...chats.filter(c => c.id !== currentChatId)];
    }
    
    localStorage.setItem(AI_CHATS_KEY, JSON.stringify(chats.slice(0, 50)));
  }

  // Função para a IA resumir o título automaticamente
  async function summarizeChatTitle(chatId) {
    const apiKey = aiApiKey?.value.trim();
    const modelId = aiModelSelect?.value || "models/gemini-1.5-flash";
    if (!apiKey || aiConversationHistory.length < 2) return;

    try {
      const formattedModelId = modelId.startsWith('models/') ? modelId : `models/${modelId}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/${formattedModelId}:generateContent?key=${apiKey}`;
      
      const prompt = {
        contents: [{
          role: "user",
          parts: [{ 
            text: `Baseado nas mensagens abaixo, crie um título curtíssimo (máximo 5 palavras) que resuma o assunto. 
            Responda APENAS o título, sem pontuação final.
            
            [CONVERSA]
            ${aiConversationHistory.map(m => `${m.role}: ${m.text}`).join('\n')}`
          }]
        }]
      };

      const response = await fetch(url, { method: 'POST', body: JSON.stringify(prompt) });
      const data = await response.json();
      const newTitle = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (newTitle) {
        let chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
        const chatIndex = chats.findIndex(c => c.id === chatId);
        if (chatIndex !== -1) {
          chats[chatIndex].title = newTitle;
          localStorage.setItem(AI_CHATS_KEY, JSON.stringify(chats));
          if (aiHistoryPanel.classList.contains('active')) renderAiHistory();
        }
      }
    } catch (e) {
      console.error("Erro ao resumir título:", e);
    }
  }

  function deleteChat(id, e, iconEl) {
    if (e) e.stopPropagation();

    // Se não estiver em modo de confirmação, ativa o "check" verde
    if (!iconEl.classList.contains('confirm')) {
      iconEl.classList.add('confirm', 'fa-check');
      iconEl.classList.remove('fa-trash');
      const originalTitle = iconEl.title;
      iconEl.title = "Clique novamente para confirmar a exclusão";

      // Reverte após 3 segundos se não houver segundo clique
      setTimeout(() => {
        if (iconEl && iconEl.classList.contains('confirm')) {
          iconEl.classList.remove('confirm', 'fa-check');
          iconEl.classList.add('fa-trash');
          iconEl.title = originalTitle;
        }
      }, 3000);
      return;
    }

    // Segundo clique: Executa a exclusão
    iconEl.classList.remove('fa-check');
    iconEl.classList.add('fa-spinner', 'fa-spin');

    let chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
    chats = chats.filter(c => c.id !== id);
    localStorage.setItem(AI_CHATS_KEY, JSON.stringify(chats));

    if (currentChatId === id) {
      startNewChat();
    } else {
      renderAiHistory();
    }
    showToast("Conversa excluída");
  }

  function exportChatToMarkdown(id, e) {
    if (e) e.stopPropagation();
    const chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
    const chat = chats.find(c => c.id === id);
    if (!chat) return;

    let md = `# Conversa DX Studio: ${chat.title}\n`;
    md += `Data: ${new Date(chat.timestamp).toLocaleString()}\n\n`;
    md += `--- \n\n`;

    chat.messages.forEach(msg => {
      const roleLabel = msg.role === 'user' ? '### 👤 Usuário' : '### 🤖 DX Assistant';
      md += `${roleLabel}\n\n${msg.text}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `chat_${chat.title.replace(/\s+/g, '_').toLowerCase()}.md`;
    
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Histórico exportado!");
  }

  // Função para importar Markdown de volta ao histórico
  importChatInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      try {
        // Parsing simples baseado nos seletores usados na exportação
        const titleMatch = content.match(/^# Conversa DX Studio: (.*)$/m);
        const title = titleMatch ? titleMatch[1].trim() : "Chat Importado";
        
        const messages = [];
        const msgRegex = /### (👤 Usuário|🤖 DX Assistant)\n\n([\s\S]*?)(?=\n\n---\n\n|$)/g;
        let match;
        
        while ((match = msgRegex.exec(content)) !== null) {
          messages.push({
            role: match[1].includes('Usuário') ? 'user' : 'assistant',
            text: match[2].trim()
          });
        }

        if (messages.length === 0) throw new Error("Nenhuma mensagem encontrada no formato DX Studio.");

        let chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
        const newChat = {
          id: Date.now(),
          timestamp: Date.now(),
          title: title,
          messages: messages
        };
        
        chats.unshift(newChat);
        localStorage.setItem(AI_CHATS_KEY, JSON.stringify(chats.slice(0, 50)));
        renderAiHistory();
        showToast("Histórico importado com sucesso!");
      } catch (err) {
        showToast("Erro ao importar: Formato inválido.");
        console.error(err);
      }
      importChatInput.value = '';
    };
    reader.readAsText(file);
  });

  // Lógica de Diff Preview
  let diffPreviewTarget = null;
  let diffCurrentCm = null;
  let diffNewCm = null;

  function openDiffModal(targetEditorInst, newCode, langMode) {
    diffPreviewTarget = targetEditorInst;
    diffModal.classList.add('active');

    // Inicializa ou limpa editores de diff
    if (!diffCurrentCm) {
      diffCurrentCm = CodeMirror($('#diffEditorCurrent'), { theme: currentTheme, readOnly: true, lineNumbers: true });
      diffNewCm = CodeMirror($('#diffEditorNew'), { theme: currentTheme, readOnly: true, lineNumbers: true });
    }

    diffCurrentCm.setOption('mode', langMode);
    diffNewCm.setOption('mode', langMode);
    
    const oldCode = targetEditorInst.getValue();
    diffCurrentCm.setValue(oldCode);
    diffNewCm.setValue(newCode);

    setTimeout(() => {
      diffCurrentCm.refresh();
      diffNewCm.refresh();

      // Aplica realce de cores usando jsdiff
      if (typeof Diff !== 'undefined') {
        const changes = Diff.diffLines(oldCode, newCode);
        let oldLineCur = 0, newLineCur = 0;

        changes.forEach(part => {
          if (part.added) {
            for (let i = 0; i < part.count; i++) diffNewCm.addLineClass(newLineCur + i, 'background', 'diff-added-line');
            newLineCur += part.count;
          } else if (part.removed) {
            for (let i = 0; i < part.count; i++) diffCurrentCm.addLineClass(oldLineCur + i, 'background', 'diff-removed-line');
            oldLineCur += part.count;
          } else {
            oldLineCur += part.count;
            newLineCur += part.count;
          }
        });
      }
    }, 50);

    confirmDiffBtn.onclick = () => {
      targetEditorInst.setValue(newCode);
      if (successSound) successSound.play().catch(() => {});
      
      // Dispara o Auto-resumo com barra de progresso
      generateAutoChangelog(oldCode, newCode);
      
      closeDiff();
      showToast("Alterações aplicadas!");
    };
  }

  // Função de Auto-resumo com Barra de Progresso Visual
  async function generateAutoChangelog(oldCode, newCode) {
    const apiKey = aiApiKey?.value.trim();
    const modelId = aiModelSelect?.value || "models/gemini-1.5-flash";
    const progressContainer = $('#ai-progress-container');
    const progressBar = $('#ai-progress-bar');
    
    if (!apiKey) return;

    try {
      // Inicia progresso
      progressContainer?.classList.remove('hidden');
      if (progressBar) {
        progressBar.style.width = '30%';
        progressBar.style.opacity = '1';
      }

      const formattedModelId = modelId.startsWith('models/') ? modelId : `models/${modelId}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/${formattedModelId}:generateContent?key=${apiKey}`;
      
      const prompt = {
        contents: [{
          role: "user",
          parts: [{ 
            text: `Resuma a seguinte alteração de código em uma única frase técnica para um changelog. Responda APENAS o resumo.
            [ANTES] ${oldCode.substring(0, 800)}
            [DEPOIS] ${newCode.substring(0, 800)}`
          }]
        }]
      };

      if (progressBar) progressBar.style.width = '70%';

      const response = await fetch(url, { method: 'POST', body: JSON.stringify(prompt) });
      const data = await response.json();
      
      if (progressBar) progressBar.style.width = '100%';

      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (summary) {
        appendAiMessage(`**Changelog:** ${summary}`, 'assistant');
      }

      // Finaliza e esconde a barra com suavidade
      setTimeout(() => {
        if (progressBar) progressBar.style.opacity = '0';
        setTimeout(() => {
          progressContainer?.classList.add('hidden');
          if (progressBar) progressBar.style.width = '0%';
        }, 300);
      }, 1000);

    } catch (e) {
      console.error("Erro no Auto-resumo:", e);
      progressContainer?.classList.add('hidden');
    }
  }

  function closeDiff() {
    diffModal.classList.remove('active');
    diffPreviewTarget = null;
  }

  [cancelDiffBtn, closeDiffBtn].forEach(btn => btn?.addEventListener('click', closeDiff));

  function startNewChat() {
    saveChatToHistory();
    currentChatId = Date.now();
    aiConversationHistory = [];
    aiChatHistory.innerHTML = '<div class="ai-message assistant">Olá! Eu tenho acesso ao seu código atual. Como posso ajudar você hoje?</div>';
    aiHistoryPanel.classList.remove('active');
    aiChatHistory.style.display = 'flex';
    $('.ai-chat-input-wrap').style.display = 'block';
    showToast("Novo chat iniciado");
  }

  function renderAiHistory() {
    const chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
    aiHistoryList.innerHTML = chats.length ? '' : '<div class="hint" style="padding:15px">Nenhum chat salvo.</div>';
    
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'ai-history-item';
      item.innerHTML = `
        <div class="chat-info">
          <span class="title">${chat.title}</span>
          <span class="date">${new Date(chat.timestamp).toLocaleString()}</span>
        </div>
        <i class="fas fa-file-download export-chat" title="Exportar Markdown"></i>
        <i class="fas fa-trash delete-chat" title="Excluir Conversa"></i>
      `;
      
      item.querySelector('.chat-info').onclick = () => loadSavedChat(chat.id);
      item.querySelector('.export-chat').onclick = (e) => exportChatToMarkdown(chat.id, e);
      item.querySelector('.delete-chat').onclick = (e) => deleteChat(chat.id, e, e.target);
      
      aiHistoryList.appendChild(item);
    });
  }

  function loadSavedChat(id) {
    const chats = JSON.parse(localStorage.getItem(AI_CHATS_KEY) || '[]');
    const chat = chats.find(c => c.id === id);
    if (!chat) return;

    currentChatId = chat.id;
    aiConversationHistory = chat.messages;
    aiChatHistory.innerHTML = '';
    aiConversationHistory.forEach(msg => appendAiMessage(msg.text, msg.role));
    
    aiHistoryPanel.classList.remove('active');
    aiChatHistory.style.display = 'flex';
    $('.ai-chat-input-wrap').style.display = 'block';
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
  }

  newAiChatBtn?.addEventListener('click', startNewChat);
  showAiHistoryBtn?.addEventListener('click', () => {
    const isVisible = aiHistoryPanel.classList.toggle('active');
    aiChatHistory.style.display = isVisible ? 'none' : 'flex';
    $('.ai-chat-input-wrap').style.display = isVisible ? 'none' : 'block';
    if (isVisible) renderAiHistory();
  });

  // Atalho para enviar mensagem com Ctrl+Enter (ou Cmd+Enter no Mac)
  aiChatInput?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // Evita disparar o atalho global de Run
      sendAiBtn?.click();
    }
  });

  function getActiveEditorContext() {
    const isSingle = modeSelect?.value === 'single';
    if (isSingle && editor) {
      return { fileName: 'index.html', content: editor.getValue(), mode: 'htmlmixed' };
    }

    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) return null;

    const mode = activeTab.dataset.mode;
    if (mode === 'settings') return { fileName: 'Configurações', content: '', mode: 'settings' };

    const inst = editors[mode] || editor;
    if (!inst || typeof inst.getValue !== 'function') return null;

    return {
      fileName: activeTab.textContent.replace('X', '').trim(),
      content: inst.getValue(),
      mode: mode
    };
  }

  // Função Coletora de Contexto (Data Orchestration)
  function getUnifiedContext(userQuery) {
    const filesContext = [];
    const isSingle = modeSelect?.value === 'single';

    if (isSingle && editor) {
      filesContext.push({ name: 'index.html', content: editor.getValue() });
    } else {
      document.querySelectorAll('.tab').forEach(tab => {
        const mode = tab.dataset.mode;
        if (mode === 'settings' || tab.style.display === 'none') return;
        
        const inst = editors[mode];
        if (inst && typeof inst.getValue === 'function') {
          const fileName = tab.textContent.replace('X', '').trim();
          filesContext.push({ name: fileName, content: inst.getValue() });
        }
      });
    }

    const activeTab = document.querySelector('.tab.active');
    const activeFile = activeTab ? activeTab.textContent.replace('X', '').trim() : (isSingle ? 'index.html' : '');

    return { files: filesContext, activeFile, userQuery };
  }

  function appendAiMessage(text, role = 'assistant') {
    if (!aiChatHistory) return;
    const msg = document.createElement('div');
    msg.className = `ai-message ${role}`;

    if (role === 'assistant') {
      // Renderiza Markdown usando marked.js
      msg.innerHTML = (typeof marked !== 'undefined') ? marked.parse(text) : text.replace(/\n/g, '<br>');

      // Adiciona botões de ação para cada bloco de código gerado
      msg.querySelectorAll('pre').forEach(pre => {
        const codeElement = pre.querySelector('code');
        const codeText = codeElement ? codeElement.innerText : pre.innerText;

        // Detecta a linguagem para oferecer a aplicação automática no editor correspondente
        let langMode = null;
        if (codeElement) {
          const classList = Array.from(codeElement.classList);
          const langClass = classList.find(cls => cls.startsWith('language-'));
          if (langClass) {
            const lang = langClass.replace('language-', '').toLowerCase();
            const mapping = {
              'css': 'css',
              'javascript': 'javascript', 'js': 'javascript',
              'html': 'htmlmixed', 'htmlmixed': 'htmlmixed', 'xml': 'htmlmixed',
              'php': 'php', 'python': 'python', 'py': 'python'
            };
            langMode = mapping[lang];
          }
        }

        const actionContainer = document.createElement('div');
        actionContainer.className = 'ai-code-action';

        // Botão Copiar
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn tiny';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copiar';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(codeText).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
          });
        };

        // Botão Aplicar (Específico para o arquivo correspondente, ex: CSS/JS/HTML)
        const isSingle = modeSelect?.value === 'single';
        const targetInst = isSingle ? editor : editors[langMode];

        if (targetInst && langMode) {
          const applyBtn = document.createElement('button');
          applyBtn.className = 'btn tiny btn-success';
          applyBtn.innerHTML = '<i class="fas fa-magic"></i> Aplicar';
          applyBtn.title = isSingle ? 'Aplicar ao editor único' : `Aplicar este código ao editor ${langMode}`;

          // Destaque visual ao passar o mouse
          applyBtn.onmouseenter = () => {
            if (pendingAiEditor && pendingAiLine !== null) {
              pendingAiEditor.addLineClass(pendingAiLine - 1, 'background', 'ai-suggested-highlight');
              pendingAiEditor.scrollIntoView({ line: pendingAiLine - 1, ch: 0 }, 200);
            }
          };
          applyBtn.onmouseleave = () => {
            if (pendingAiEditor && pendingAiLine !== null) {
              pendingAiEditor.removeLineClass(pendingAiLine - 1, 'background', 'ai-suggested-highlight');
            }
          };
          
          applyBtn.onclick = () => {
            // Em vez de aplicar direto, abre o preview de diff
            openDiffModal(targetInst, codeText, langMode);
            if (!isSingle) switchTab(langMode);
          };
          actionContainer.appendChild(applyBtn);
        }

        // Botão Inserir no Editor
        const insertBtn = document.createElement('button');
        insertBtn.className = 'btn tiny primary';
        insertBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Inserir';
        insertBtn.title = "Inserir este código no editor ativo";
        insertBtn.onclick = () => {
          const context = getActiveEditorContext();
          if (context && context.mode !== 'settings') {
            const inst = editors[context.mode] || editor;
            if (inst) {
              inst.replaceRange(codeText, inst.getCursor());
              showToast("Código inserido no editor!");
            }
          } else {
            showToast("Abra um arquivo compatível para inserir o código.");
          }
        };

        actionContainer.appendChild(copyBtn);
        actionContainer.appendChild(insertBtn);
        pre.appendChild(actionContainer);
      });
    } else {
      msg.textContent = text;
    }

    aiChatHistory.appendChild(msg);
    aiChatHistory.scrollTop = aiChatHistory.scrollHeight;
  }

  sendAiBtn?.addEventListener('click', async () => {
    const text = aiChatInput.value.trim();
    const apiKey = aiApiKey?.value.trim();
    const modelId = aiModelSelect?.value || "models/gemini-1.5-flash";

    if (!text) return;

    if (!apiKey) {
      showToast("Configure sua API Key nas configurações da IA.");
      aiConfigPanel?.classList.remove('hidden');
      return;
    }

    appendAiMessage(text, 'user');
    aiChatInput.value = '';

    // Orquestração do Contexto Unificado
    const contextData = getUnifiedContext(text);

    try {
      // Feedback visual de "pensando"
      sendAiBtn.disabled = true;
      const loadingId = 'ai-loading-' + Date.now();
      const loadingMsg = document.createElement('div');
      loadingMsg.id = loadingId;
      loadingMsg.className = 'ai-message assistant';
      loadingMsg.textContent = 'Analisando código...';
      aiChatHistory.appendChild(loadingMsg);
      aiChatHistory.scrollTop = aiChatHistory.scrollHeight;

      // Formatação dinâmica do Model ID e URL
      const formattedModelId = modelId.startsWith('models/') ? modelId : `models/${modelId}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/${formattedModelId}:generateContent?key=${apiKey}`;

      // HISTÓRICO DE CHAT: Mapeia as mensagens anteriores para o formato do Gemini
      const historyPayload = aiConversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

      // PROMPT E PERSONALIZAÇÃO: Instruímos a IA sobre seu papel e o contexto do projeto.
      const currentTurn = {
        role: "user",
        parts: [{ 
          text: `Você é o DX AI Assistant. Analise o contexto do projeto em JSON e responda ao usuário.
          Sempre use blocos de código com a linguagem especificada (ex: \`\`\`javascript).
          
          [CONTEXTO DO PROJETO]
          ${JSON.stringify(contextData, null, 2)}`
        }]
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [...historyPayload, currentTurn] })
      });

      const data = await response.json();
      document.getElementById(loadingId)?.remove();
      sendAiBtn.disabled = false;

      // Log para depuração facilitada
      console.log("Resposta da API Gemini:", data);

      if (response.ok && data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        
        // Verifica se a resposta foi bloqueada por filtros de segurança
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
          appendAiMessage(`A IA não pôde responder pois o conteúdo foi filtrado (Motivo: ${candidate.finishReason}). Tente reformular sua pergunta.`, 'assistant');
          return;
        }

        const aiResponse = candidate.content?.parts?.[0]?.text;
        
        if (!aiResponse) {
          appendAiMessage("Recebi uma resposta sem conteúdo de texto da IA. Verifique o console.", 'assistant');
          console.warn("Estrutura de resposta inesperada (sem texto):", data);
          return;
        }

        appendAiMessage(aiResponse, 'assistant');

        // MEMÓRIA DA CONVERSA: Adiciona o par pergunta/resposta ao histórico local
        aiConversationHistory.push({ role: 'user', text: text });
        aiConversationHistory.push({ role: 'assistant', text: aiResponse });
        
        saveChatToHistory();

        // Resumo automático: Dispara quando a conversa tem 4 mensagens (2 trocas)
        if (aiConversationHistory.length === 4) {
          summarizeChatTitle(currentChatId);
        }

        // Otimização: Mantém apenas as últimas 10 trocas
        if (aiConversationHistory.length > 10) {
          aiConversationHistory = aiConversationHistory.slice(-10);
        }
      } else if (response.status === 429) {
        appendAiMessage("Ops! Atingimos o limite de cota da API (Erro 429). Tente alternar o modelo ou aguarde um momento.", 'assistant');
      } else if (data.error) {
        const errorMsg = data.error.message || "Erro desconhecido na API.";
        appendAiMessage(`Erro no Gemini (${data.error.status || response.status}): ${errorMsg}`, 'assistant');
        console.error("Erro detalhado da API:", data.error);
      } else {
        appendAiMessage(`Erro na requisição (Status ${response.status}). Verifique sua conexão e a chave de API.`, 'assistant');
        console.error("Erro inesperado na resposta:", data);
      }
    } catch (error) {
      sendAiBtn.disabled = false;
      const loadingMsg = aiChatHistory.querySelector('.assistant:last-child');
      if (loadingMsg && loadingMsg.textContent === 'Analisando código...') loadingMsg.remove();
      
      appendAiMessage("Erro crítico de conexão. Verifique sua internet e a chave de API.", 'assistant');
      console.error("AI Error:", error);
    }
  });

  // Ativa o colapso das seções na Sidebar (Chevron)
  document.querySelectorAll('.sidebar-section-title').forEach(title => {
    title.addEventListener('click', () => {
      const targetId = title.getAttribute('data-target');
      const targetList = document.getElementById(targetId);
      const icon = title.querySelector('i');
      
      const isHidden = targetList.style.display === 'none';
      targetList.style.display = isHidden ? 'flex' : 'none';
      if (icon) icon.className = isHidden ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
    });
  });

  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || !data.__dxStudioConsole) return;

    // REQUISITO: Espelhar erros do console no Terminal automaticamente
    if (data.type === 'error') {
      appendTerminal(`[Console Error] ${data.payload.filter(p => typeof p === 'string').join(' ')}`, 'error');
    }

    const prefix = data.type === 'error' ? '❌' : data.type === 'warn' ? '⚠️' : '•';
    
    // Destaque e snippet para Erros e Avisos
    let actualJsLine = null;
    if ((data.type === 'error' || data.type === 'warn') && consoleEl) {
      consoleEl.classList.remove('minimized');
      const icon = toggleConsoleBtn?.querySelector('i');
      if (icon) icon.className = 'fas fa-chevron-down';
      
      consoleEl.classList.add('expanded');

      const targetEditor = modeSelect.value === 'single' ? editor : editorJsInstance;

      const msgStr = data.payload.join(' ');
      const lineMatch = msgStr.match(/linha (\d+)/);
      if (lineMatch) {
        const reportedLine = parseInt(lineMatch[1]);
        actualJsLine = reportedLine - lastJsOffset;
        if (actualJsLine > 0 && targetEditor) {
          // Adiciona à lista de navegação
          errorNavigationList.push({
            editor: targetEditor,
            line: actualJsLine - 1,
            type: data.type
          });
          highlightLine(targetEditor, actualJsLine - 1, data.type);
          
          // Exibir a linha de código no terminal
          const codeLine = targetEditor.getLine(actualJsLine - 1);
          if (codeLine) {
            data.payload.push(`\n    > ${actualJsLine} | ${codeLine.trim()}`);
          }
        }
      }

      if (data.type === 'error') {
        // Efeito de piscar em vermelho apenas para erros
        consoleEl.classList.remove('console-error-blink');
        void consoleEl.offsetWidth; // Trigger reflow
        consoleEl.classList.add('console-error-blink');
      }
    }
    
    appendConsole([prefix].concat(data.payload), data.type, actualJsLine, modeSelect.value === 'single' ? editor : editorJsInstance);
  });

  // Atalhos de Teclado (Ctrl/⌘ + ...)
  window.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl + Shift + D: Command Palette
    if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      openCommandPalette();
    }

    // Ctrl + ` : Mostrar/Ocultar Terminal (Toggle)
    if (mod && e.key === '`') {
      e.preventDefault();
      const terminal = $('#terminalWrap');
      if (terminal) {
        const isHidden = terminal.offsetHeight <= 0;
        if (isHidden) {
          terminal.style.height = terminal.dataset.lastHeight || '150px';
        } else {
          terminal.dataset.lastHeight = terminal.style.height;
          terminal.style.height = '0px';
        }
        saveLayout();
        editorInstances.forEach(inst => inst.refresh());
      }
    }

    // Ctrl + Enter: Rodar o código
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      run();
    }

    // Ctrl + S: Salvar Projeto
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
      showToast('Projeto salvo!');
    }

    // Ctrl + + ou Ctrl + = : Aumentar Zoom
    if (mod && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      const current = parseFloat(zoomRange.value);
      const newVal = Math.min(1.5, current + 0.1).toFixed(2);
      applyZoom(newVal);
      showToast(`Zoom: ${Math.round(newVal * 100)}%`);
    }

    // Ctrl + - : Diminuir Zoom
    if (mod && e.key === '-') {
      e.preventDefault();
      const current = parseFloat(zoomRange.value);
      const newVal = Math.max(0.2, current - 0.1).toFixed(2);
      applyZoom(newVal);
      showToast(`Zoom: ${Math.round(newVal * 100)}%`);
    }

    // Ctrl + 0: Resetar Zoom (1:1)
    if (mod && e.key === '0') {
      e.preventDefault();
      applyZoom(1);
      showToast('Zoom: 100%');
    }

    // Ctrl + 1: Ajustar à Tela (Fit to Screen)
    if (mod && e.key === '1') {
      e.preventDefault();
      fitToScreen();
      showToast(`Ajustado: ${Math.round(parseFloat(zoomRange.value) * 100)}%`);
    }

    // F8 / Shift+F8: Navegar entre erros
    if (e.key === 'F8') {
      e.preventDefault();
      navigateErrors(e.shiftKey ? -1 : 1);
    }

    // Ctrl + P: Snapshot
    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      takeSnapshot();
    }

    // Ctrl + Shift + F: Formatar Código
    if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatCode();
      showToast('Código formatado');
    }

    // Ctrl + L: Limpar Console
    if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clearConsole();
      showToast('Console limpo');
    }

    // Ctrl + Shift + O: Alternar Orientação
    if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      toggleOrientation();
      const isLandscape = previewFrame.classList.contains('landscape');
      showToast(`Modo: ${isLandscape ? 'Paisagem' : 'Retrato'}`);
    }

    // Ctrl + B: Toggle Sidebar (Explorer)
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebar(); // Usa a função unificada
    }

    // Ctrl + Tab: Ciclar entre arquivos abertos
    if (mod && e.key === 'Tab') {
      e.preventDefault();
      const visibleTabs = Array.from(document.querySelectorAll('.tab'))
                            .filter(t => t.style.display !== 'none');
      if (visibleTabs.length <= 1) return;

      const currentIndex = visibleTabs.findIndex(t => t.classList.contains('active'));
      const direction = e.shiftKey ? -1 : 1;
      let nextIndex = (currentIndex + direction + visibleTabs.length) % visibleTabs.length;
      
      switchTab(visibleTabs[nextIndex].getAttribute('data-mode'));
    }
  });

  // Sincroniza o ícone do botão de tela cheia
  document.addEventListener('fullscreenchange', () => {
    const icon = fullscreenBtn?.querySelector('i');
    if (icon) {
      icon.className = document.fullscreenElement ? 'fas fa-compress-arrows-alt' : 'fas fa-expand-arrows-alt';
    }
  });

  // Ajuste automático ao redimensionar a janela (Debounced)
  window.addEventListener('resize', debounce(() => {
    fitToScreen();
  }, 250));

  // Primeiro boot
  document.documentElement.style.setProperty('--editor-font-size', currentFontSize);
  if (consoleWrap) consoleWrap.setAttribute('data-theme', currentTheme);
  
  // Carregar preferências de visualização
  const savedDevice = localStorage.getItem(DEVICE_KEY) || 'pc';
  const savedZoom = localStorage.getItem(ZOOM_KEY) || '1';
  changeDevice(savedDevice, false);
  applyZoom(savedZoom, false);

  // Restaurar Layout
  const savedExplorerWidth = localStorage.getItem(EXPLORER_WIDTH_KEY);
  const savedPanelsFlex = JSON.parse(localStorage.getItem(PANELS_FLEX_KEY) || 'null');
  const savedConsoleHeight = localStorage.getItem(CONSOLE_HEIGHT_KEY);
  const savedTabBarHeight = localStorage.getItem(TABBAR_HEIGHT_KEY);
  const savedTerminalHeight = localStorage.getItem(TERMINAL_HEIGHT_KEY);
  const savedTabWidths = JSON.parse(localStorage.getItem(TAB_WIDTHS_KEY) || '{}');

  // Restaura a largura da sidebar e o estado do ícone do explorador
  const sidebar = $('#sidebar');
  const explorerIcon = document.querySelector('.activity-bar i[title="Explorador"]');
  if (sidebar && explorerIcon) {
    if (savedExplorerWidth && savedExplorerWidth !== '0px') {
      sidebar.style.width = savedExplorerWidth;
      explorerIcon.classList.add('active');
      if (resizerS) resizerS.style.display = 'block';
    } else {
      sidebar.style.width = '0px';
      explorerIcon.classList.remove('active');
      if (resizerS) resizerS.style.display = 'none';
    }
  }
  if (savedPanelsFlex) {
    $('.editorPanel').style.flex = savedPanelsFlex.editor;
    $('.previewPanel').style.flex = savedPanelsFlex.preview;
  }
  if (savedConsoleHeight && consoleEl) consoleEl.style.maxHeight = savedConsoleHeight;
  if (savedTabBarHeight && $('#tabBar')) $('#tabBar').style.height = savedTabBarHeight;
  if (savedTerminalHeight && $('#terminalWrap')) $('#terminalWrap').style.height = savedTerminalHeight;
  
  appendTerminal('DX Studio Terminal - Pronto para comandos.', 'info');
  initMinimap();

  // Restaurar larguras das abas
  Object.keys(savedTabWidths).forEach(mode => {
    const tab = document.querySelector(`.tab[data-mode="${mode}"]`);
    if (tab) tab.style.width = savedTabWidths[mode];
  });

  updateSidebarFileList();
  renderRecentFiles();

  // Restaurar a ordem das abas salvas
  const savedTabOrder = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]');
  if (savedTabOrder.length > 0) {
    const tabBar = $('#tabBar');
    const fileEditorsWrap = $('#fileEditors');
    const addTabBtn = $('#addTabBtn');

    // Mapeia elementos de aba e editor por seu data-mode/id para fácil acesso
    const tabElements = {};
    const editorDivElements = {};

    document.querySelectorAll('.tab').forEach(tab => {
      tabElements[tab.dataset.mode] = tab;
    });

    // Coleta todos os divs de editor (fixos e dinâmicos)
    document.querySelectorAll('.fileEditors .singleEditor, #editor').forEach(editorDiv => {
      editorDivElements[editorDiv.id] = editorDiv;
    });
    // Mapeia modos fixos para seus IDs de div de editor
    editorDivElements['htmlmixed'] = document.getElementById('editorHtml');
    editorDivElements['css'] = document.getElementById('editorCss');
    editorDivElements['javascript'] = document.getElementById('editorJs');
    editorDivElements['php'] = document.getElementById('editorPhp');
    editorDivElements['python'] = document.getElementById('editorPy');
    editorDivElements['settings'] = document.getElementById('editorSettings');

    // Limpa a ordem atual para reconstruir
    tabBar.innerHTML = '';
    fileEditorsWrap.innerHTML = '';

    savedTabOrder.forEach(mode => {
      const tab = tabElements[mode];
      const editorDiv = editorDivElements[mode] || editorDivElements[getEditorPanelIdFromMode(mode)]; // Tenta por mode, depois por mapeamento fixo
      if (tab && editorDiv) {
        tabBar.appendChild(tab);
        fileEditorsWrap.appendChild(editorDiv);
      }
    });
    // Garante que o botão de adicionar aba esteja sempre no final
    if (addTabBtn) tabBar.appendChild(addTabBtn);
  }

  // Diagnóstico de LocalStorage (Verificação de variáveis)
  console.group('%c DX Studio - Debug System ', 'background: #7c5cff; color: #fff; border-radius: 4px; padding: 2px;');
  console.log('Tema:', currentTheme);
  console.log('Fonte:', currentFontSize);
  console.log('Auto-Clear:', autoClearConsole);
  console.log('Timestamps:', showTimestamps);
  console.log('Snapshot Timer:', snapshotTimerSeconds, 's');
  console.groupEnd();

  setStatus('Pronto. Clique em Run.');
});
