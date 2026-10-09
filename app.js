/* 图片合成工作台 —— 主图居中叠加到背景图（纯前端，无需上传服务器） */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const state = {
    bgs: [],            // {id, name, url, img, w, h}
    mains: [],          // 同上
    selBg: null,
    selMain: null,
    pairMode: 'single',
    results: [],        // {id, name, url, blob, w, h}
    seq: 0,
  };

  /* ================= 工具 ================= */
  const uid = () => 'f' + (++state.seq) + '_' + Math.random().toString(36).slice(2, 7);

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const numOf = (id) => Math.max(1, parseInt($(id).value, 10) || 1);

  /* 画布比例提示 + 预设高亮 */
  function updateRatioTip() {
    const w = numOf('outW'), h = numOf('outH'), g = gcd(w, h) || 1;
    $('outRatioTip').textContent = `${w / g} : ${h / g}`;
  }
  function syncOutChips() {
    const w = numOf('outW'), h = numOf('outH');
    [...$('sizePresets').children].forEach(b => {
      if (b.id === 'btnUseBg') return;
      b.classList.toggle('on', +b.dataset.w === w && +b.dataset.h === h);
    });
  }
  /* 主图「锁定原图比例」时，高度跟随当前主图自动算 */
  function syncFgHeight() {
    if ($('fgMode').value !== 'size' || !$('fgLockAR').checked) return;
    const fg = state.mains.find(x => x.id === state.selMain);
    if (fg) $('fgH').value = Math.round(numOf('fgW') / (fg.w / fg.h)) || 1;
  }

  async function loadImage(file) {
    let img, w, h;
    if (window.createImageBitmap) {
      try {
        img = await createImageBitmap(file, { imageOrientation: 'from-image' });
        w = img.width; h = img.height;
      } catch (e) { img = null; }
    }
    if (!img) {
      const url = URL.createObjectURL(file);
      img = new Image();
      img.decoding = 'sync';
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = () => rej(new Error('图片读取失败'));
        img.src = url;
      });
      w = img.naturalWidth; h = img.naturalHeight;
    }
    return { img, w, h, url: URL.createObjectURL(file) };
  }

  /* ================= 上传 ================= */
  async function addFiles(files, kind) {
    const arr = Array.from(files || []).filter(f => f.type.indexOf('image/') === 0);
    if (!arr.length) { toast('请选择图片文件'); return; }
    for (const f of arr) {
      try {
        const { img, w, h, url } = await loadImage(f);
        const item = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), url, img, w, h };
        if (kind === 'bg') {
          state.bgs.push(item);
          if (!state.selBg) state.selBg = item.id;
        } else {
          state.mains.push(item);
          if (!state.selMain) state.selMain = item.id;
        }
      } catch (e) { console.warn(e); }
    }
    renderLists();
    updatePreview();
  }

  function setupDrop(dropId, inputId, kind) {
    const drop = $(dropId), input = $(inputId);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { addFiles(input.files, kind); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.remove('over');
    }));
    drop.addEventListener('drop', e => addFiles(e.dataTransfer.files, kind));
  }

  /* ================= 列表渲染 ================= */
  function renderLists() {
    const draw = (list, host, selKey) => {
      const ul = $(host);
      ul.innerHTML = '';
      list.forEach(it => {
        const li = document.createElement('li');
        li.className = state[selKey] === it.id ? 'sel' : '';
        li.title = `${it.name} · ${it.w}×${it.h}`;
        li.innerHTML = `<img src="${it.url}" alt="">
          <div class="tag">${it.w}×${it.h}</div>
          <button class="del" title="移除">×</button>`;
        li.addEventListener('click', () => { state[selKey] = it.id; renderLists(); updatePreview(); });
        li.querySelector('.del').addEventListener('click', (e) => {
          e.stopPropagation();
          const i = list.findIndex(x => x.id === it.id);
          if (i > -1) { URL.revokeObjectURL(it.url); list.splice(i, 1); }
          if (state[selKey] === it.id) state[selKey] = list.length ? list[0].id : null;
          renderLists(); updatePreview();
        });
        ul.appendChild(li);
      });
    };
    draw(state.bgs, 'listBg', 'selBg');
    draw(state.mains, 'listMain', 'selMain');
    $('statBg').textContent = '背景 ' + state.bgs.length;
    $('statMain').textContent = '主图 ' + state.mains.length;
    updatePairHint();
  }

  function updatePairHint() {
    const n = pairCount();
    const txt = {
      single: `所有主图都合成到第 1 张背景图上，共 ${n} 张。`,
      pair: `第 i 张主图对应第 i 张背景（数量不足时循环复用），共 ${n} 张。`,
      cross: `每张主图 × 每张背景全组合，共 ${n} 张。`,
    };
    $('pairHint').textContent = txt[state.pairMode];
  }

  /* ================= 设置读取 ================= */
  function opts() {
    return {
      outSizeMode: $('outSizeMode').value,
      outW: Math.max(1, parseInt($('outW').value, 10) || 1080),
      outH: Math.max(1, parseInt($('outH').value, 10) || 1080),
      bgFit: $('bgFit').value,
      bgColor: $('bgColor').value,
      fgMode: $('fgMode').value,
      widthPct: +$('fgWidthPct').value,
      maxHeightPct: +$('fgMaxHeightPct').value,
      widthPx: Math.max(1, parseInt($('fgWidthPx').value, 10) || 800),
      fgW: Math.max(1, parseInt($('fgW').value, 10) || 800),
      fgH: Math.max(1, parseInt($('fgH').value, 10) || 600),
      fgLockAR: $('fgLockAR').checked,
      outLockAR: $('outLockAR').checked,
      offX: parseInt($('offX').value, 10) || 0,
      offY: parseInt($('offY').value, 10) || 0,
      opacity: +$('fgOpacity').value / 100,
      radius: +$('fgRadius').value,
      shadow: $('fgShadow').checked,
      format: $('outFormat').value,
      quality: +$('outQuality').value / 100,
      whiteBg: $('jpegBg').checked,
    };
  }

  function canvasSize(bg, fg, o) {
    if (o.outSizeMode === 'custom') return { w: o.outW, h: o.outH };
    if (o.outSizeMode === 'main' && fg) return { w: fg.w, h: fg.h };
    if (bg) return { w: bg.w, h: bg.h };
    if (fg) return { w: fg.w, h: fg.h };
    return { w: 800, h: 800 };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ================= 核心合成 ================= */
  function compose(bg, fg, o) {
    const { w: W, h: H } = canvasSize(bg, fg, o);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const needSolid = (o.format === 'image/jpeg' && o.whiteBg) ||
      (bg && (o.bgFit === 'contain' || o.bgFit === 'original'));
    if (needSolid) {
      ctx.fillStyle = o.format === 'image/jpeg' && o.whiteBg ? '#ffffff' : o.bgColor;
      ctx.fillRect(0, 0, W, H);
    }

    /* 背景图 */
    if (bg) {
      let bw, bh;
      if (o.bgFit === 'stretch') { bw = W; bh = H; }
      else if (o.bgFit === 'original') { bw = bg.w; bh = bg.h; }
      else {
        const s = o.bgFit === 'cover'
          ? Math.max(W / bg.w, H / bg.h)
          : Math.min(W / bg.w, H / bg.h);
        bw = bg.w * s; bh = bg.h * s;
      }
      ctx.drawImage(bg.img, (W - bw) / 2, (H - bh) / 2, bw, bh);
    }

    if (!fg) return cv;

    /* 主图目标尺寸 */
    const ar = fg.w / fg.h;
    let fw, fh;
    if (o.fgMode === 'cover') {
      const s = Math.max(W / fg.w, H / fg.h);
      fw = fg.w * s; fh = fg.h * s;
    } else if (o.fgMode === 'pixel') {
      fw = o.widthPx; fh = fw / ar;
    } else if (o.fgMode === 'size') {
      fw = o.fgW; fh = o.fgLockAR ? Math.round(o.fgW / ar) : o.fgH;
    } else if (o.fgMode === 'original') {
      fw = fg.w; fh = fg.h;
    } else {
      fw = W * o.widthPct / 100; fh = fw / ar;
    }
    const maxH = H * o.maxHeightPct / 100;
    if (o.fgMode !== 'cover' && fh > maxH) {
      if (o.fgMode === 'size' && !o.fgLockAR) {
        const k = maxH / fh;              // 自定义宽高：等比缩小，保留用户设定的比例
        fw = Math.round(fw * k); fh = maxH;
      } else {
        fh = maxH; fw = fh * ar;
      }
    }

    /* 居中 + 偏移 */
    const dx = Math.round((W - fw) / 2) + o.offX;
    const dy = Math.round((H - fh) / 2) + o.offY;

    /* 需要圆角或投影时，先离屏处理主图 */
    if (o.radius > 0 || o.shadow) {
      const t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(fw));
      t.height = Math.max(1, Math.round(fh));
      const tc = t.getContext('2d');
      if (o.radius > 0) { roundRectPath(tc, 0, 0, t.width, t.height, o.radius); tc.clip(); }
      tc.drawImage(fg.img, 0, 0, t.width, t.height);
      ctx.save();
      if (o.opacity < 1) ctx.globalAlpha = o.opacity;
      if (o.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,.35)';
        ctx.shadowBlur = Math.round(Math.min(W, H) * 0.03) + 8;
        ctx.shadowOffsetY = Math.round(Math.min(W, H) * 0.012) + 4;
      }
      ctx.drawImage(t, dx, dy);
      ctx.restore();
    } else {
      ctx.save();
      if (o.opacity < 1) ctx.globalAlpha = o.opacity;
      ctx.drawImage(fg.img, dx, dy, fw, fh);
      ctx.restore();
    }
    return cv;
  }

  /* ================= 预览 ================= */
  let raf = null;
  function updatePreview() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      syncFgHeight();
      const bg = state.bgs.find(x => x.id === state.selBg);
      const fg = state.mains.find(x => x.id === state.selMain);
      const cv = $('preview'), empty = $('previewEmpty');
      if (!bg && !fg) {
        cv.width = cv.height = 0;
        empty.classList.remove('hide');
        $('previewMeta').innerHTML = '请先上传背景图<b>和</b>主图';
        return;
      }
      const o = opts();
      const out = compose(bg, fg, o);
      cv.width = out.width; cv.height = out.height;
      cv.getContext('2d').drawImage(out, 0, 0);
      const { w: W, h: H } = canvasSize(bg, fg, o);

      /* 只上传了一类图时，预览照样显示已上传的那张，面板不会空白 */
      empty.classList.add('hide');
      if (bg && fg) {
        $('previewMeta').innerHTML =
          `背景 ${bg.name} (${bg.w}×${bg.h}) &nbsp;·&nbsp; 主图 ${fg.name} (${fg.w}×${fg.h}) &nbsp;·&nbsp; 输出 ${W}×${H}`;
      } else if (bg) {
        $('previewMeta').innerHTML =
          `背景 ${bg.name} (${bg.w}×${bg.h}) &nbsp;·&nbsp; <b class="warn">还缺主图</b> &nbsp;·&nbsp; 输出 ${W}×${H}`;
      } else {
        $('previewMeta').innerHTML =
          `主图 ${fg.name} (${fg.w}×${fg.h}) &nbsp;·&nbsp; <b class="warn">还缺背景图</b> &nbsp;·&nbsp; 输出 ${W}×${H}`;
      }
    });
  }

  /* ================= 配对 ================= */
  function pairs() {
    const out = [];
    if (!state.bgs.length || !state.mains.length) return out;
    if (state.pairMode === 'single') {
      state.mains.forEach(m => out.push([state.bgs[0], m]));
    } else if (state.pairMode === 'pair') {
      state.mains.forEach((m, i) => out.push([state.bgs[i % state.bgs.length], m]));
    } else {
      state.mains.forEach(m => state.bgs.forEach(b => out.push([b, m])));
    }
    return out;
  }
  function pairCount() { return pairs().length; }

  /* ================= 批量生成 ================= */
  function extOf(fmt) {
    return fmt === 'image/jpeg' ? '.jpg' : fmt === 'image/webp' ? '.webp' : '.png';
  }
  function toBlob(cv, o) {
    return new Promise(res => {
      if (cv.toBlob) cv.toBlob(b => res(b), o.format, o.quality);
      else {
        const d = cv.toDataURL(o.format, o.quality).split(',')[1];
        const bin = atob(d), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        res(new Blob([u8], { type: o.format }));
      }
    });
  }

  async function generate() {
    const list = pairs();
    if (!list.length) { toast('请先上传至少 1 张背景图和 1 张主图'); return; }
    const btns = [$('btnGenerate'), $('btnGenerateTop')].filter(Boolean);
    btns.forEach(b => b.disabled = true);
    $('progressWrap').hidden = false;
    const o = opts(), ext = extOf(o.format), used = {};
    let base = $('nameMode').value === 'prefix' ? ($('prefix').value || '合成_') : '';

    for (let i = 0; i < list.length; i++) {
      const [bg, fg] = list[i];
      const cv = compose(bg, fg, o);
      const blob = await toBlob(cv, o);
      if (!blob) continue;
      let name;
      if (base) {
        name = base + String(i + 1).padStart(3, '0') + ext;
      } else {
        name = fg.name + (state.pairMode === 'cross' ? '_' + bg.name : '') + ext;
      }
      if (used[name]) { used[name]++; name = name.replace(ext, '') + '_' + used[name] + ext; }
      else used[name] = 1;
      state.results.push({
        id: uid(), name, url: URL.createObjectURL(blob),
        blob, w: cv.width, h: cv.height, size: blob.size
      });
      const p = Math.round((i + 1) / list.length * 100);
      $('progressBar').style.width = p + '%';
      $('progressText').textContent = `${i + 1} / ${list.length}`;
      renderResults();
      await new Promise(r => setTimeout(r, 0));
    }
    btns.forEach(b => b.disabled = false);
    setTimeout(() => { $('progressWrap').hidden = true; }, 700);
    toast(`已生成 ${list.length} 张合成图`);
  }

  function renderResults() {
    const host = $('results');
    host.innerHTML = '';
    state.results.forEach(r => {
      const card = document.createElement('div');
      card.className = 'rcard';
      card.innerHTML = `
        <div class="pic"><img src="${r.url}" alt="${r.name}"></div>
        <div class="info">
          <div class="nm" title="${r.name}">${r.name}</div>
          <div class="sub">${r.w}×${r.h} · ${fmtSize(r.size)}</div>
          <div class="ops">
            <button data-act="dl">下载</button>
            <button data-act="del" class="gray">删除</button>
          </div>
        </div>`;
      card.querySelector('[data-act=dl]').addEventListener('click', () => downloadBlob(r.blob, r.name));
      card.querySelector('[data-act=del]').addEventListener('click', () => {
        const i = state.results.findIndex(x => x.id === r.id);
        if (i > -1) { URL.revokeObjectURL(r.url); state.results.splice(i, 1); }
        renderResults();
      });
      host.appendChild(card);
    });
    $('resultCount').textContent = state.results.length;
    $('statOut').textContent = '已生成 ' + state.results.length;
    $('resultEmpty').classList.toggle('hide', state.results.length > 0);
    $('btnZip').disabled = state.results.length === 0;
    $('btnClearResult').disabled = state.results.length === 0;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ================= ZIP（纯前端，store 模式） ================= */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function buildZip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const now = new Date();
    const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    const dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    files.forEach(f => {
      const nb = enc.encode(f.name), data = f.data, crc = crc32(data), size = data.length;
      const lh = new Uint8Array(30 + nb.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, dt, true); lv.setUint16(12, dd, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
      lv.setUint16(26, nb.length, true); lv.setUint16(28, 0, true);
      lh.set(nb, 30);

      const ch = new Uint8Array(46 + nb.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, dt, true); cv.setUint16(14, dd, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
      cv.setUint16(28, nb.length, true);
      cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nb, 46);

      parts.push(lh, data); central.push(ch);
      offset += lh.length + size;
    });

    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }

  async function zipAndDownload() {
    if (!state.results.length) return;
    toast('正在打包…');
    const files = [];
    for (const r of state.results) {
      files.push({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) });
    }
    const blob = buildZip(files);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(blob, `合成图_${stamp}.zip`);
    toast(`已导出 ${files.length} 张`);
  }

  /* ================= 事件绑定 ================= */
  function bind() {
    setupDrop('dropBg', 'fileBg', 'bg');
    setupDrop('dropMain', 'fileMain', 'main');

    $('pairMode').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.pairMode = b.dataset.mode;
      [...$('pairMode').children].forEach(x => x.classList.toggle('on', x === b));
      updatePairHint();
    });

    const syncLabels = () => {
      $('vWidth').textContent = $('fgWidthPct').value + '%';
      $('vHeight').textContent = $('fgMaxHeightPct').value + '%';
      $('vOpacity').textContent = $('fgOpacity').value + '%';
      $('vRadius').textContent = $('fgRadius').value;
      $('vQuality').textContent = $('outQuality').value;
    };
    document.querySelectorAll('input[type=range]').forEach(el => {
      el.addEventListener('input', () => { syncLabels(); updatePreview(); });
    });
    document.querySelectorAll('select, input[type=number], input[type=text], input[type=color], input[type=checkbox]')
      .forEach(el => el.addEventListener('change', () => { syncLabels(); updatePreview(); }));

    $('fgMode').addEventListener('change', () => {
      const v = $('fgMode').value;
      $('fgPercentBox').hidden = !(v === 'percent');
      $('fgPixelBox').hidden = !(v === 'pixel');
      $('fgSizeBox').hidden = !(v === 'size');
    });
    $('outSizeMode').addEventListener('change', () => {
      $('outCustom').hidden = $('outSizeMode').value !== 'custom';
      updateRatioTip();
    });
    $('bgFit').addEventListener('change', () => {
      const v = $('bgFit').value;
      $('bgColorField').hidden = !(v === 'contain' || v === 'original');
    });
    $('nameMode').addEventListener('change', () => {
      $('prefixBox').hidden = $('nameMode').value !== 'prefix';
    });

    /* ---- 自定义尺寸 ---- */
    const num = (id) => Math.max(1, parseInt($(id).value, 10) || 1);
    const curFg = () => state.mains.find(x => x.id === state.selMain);
    const curBg = () => state.bgs.find(x => x.id === state.selBg);
    let outRatio = num('outW') / num('outH');

    $('sizePresets').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'btnUseBg') {
        const bg = curBg();
        if (!bg) { toast('请先上传背景图'); return; }
        $('outW').value = bg.w; $('outH').value = bg.h;
      } else {
        $('outW').value = b.dataset.w; $('outH').value = b.dataset.h;
      }
      outRatio = num('outW') / num('outH');
      syncOutChips(); updateRatioTip(); updatePreview();
    });

    $('btnOutSwap').addEventListener('click', () => {
      const w = $('outW').value; $('outW').value = $('outH').value; $('outH').value = w;
      outRatio = num('outW') / num('outH');
      syncOutChips(); updateRatioTip(); updatePreview();
    });

    $('outW').addEventListener('input', () => {
      if ($('outLockAR').checked) $('outH').value = Math.round(num('outW') / outRatio) || 1;
      syncOutChips(); updateRatioTip(); updatePreview();
    });
    $('outH').addEventListener('input', () => {
      if ($('outLockAR').checked) $('outW').value = Math.round(num('outH') * outRatio) || 1;
      syncOutChips(); updateRatioTip(); updatePreview();
    });
    $('outLockAR').addEventListener('change', () => { outRatio = num('outW') / num('outH'); });

    $('fgW').addEventListener('input', () => {
      if ($('fgLockAR').checked) {
        const fg = curFg();
        if (fg) $('fgH').value = Math.round(num('fgW') / (fg.w / fg.h)) || 1;
      }
      updatePreview();
    });
    $('fgLockAR').addEventListener('change', () => {
      const h = $('fgH');
      h.readOnly = $('fgLockAR').checked;
      if ($('fgLockAR').checked) {
        const fg = curFg();
        if (fg) h.value = Math.round(num('fgW') / (fg.w / fg.h)) || 1;
      }
      updatePreview();
    });
    $('btnFgSwap').addEventListener('click', () => {
      const w = $('fgW').value; $('fgW').value = $('fgH').value; $('fgH').value = w;
      if ($('fgLockAR').checked) {
        $('fgLockAR').checked = false; $('fgH').readOnly = false;
        toast('已解除比例锁定，可自由拉伸');
      }
      updatePreview();
    });

    $('btnGenerate').addEventListener('click', generate);
    $('btnGenerateTop').addEventListener('click', generate);
    $('btnZip').addEventListener('click', zipAndDownload);
    $('btnClearResult').addEventListener('click', () => {
      state.results.forEach(r => URL.revokeObjectURL(r.url));
      state.results = []; renderResults();
    });

    if ($('fgLockAR').checked) $('fgH').readOnly = true;
    $('fgSizeBox').hidden = $('fgMode').value !== 'size';
    updateRatioTip(); syncOutChips();
    syncLabels();
  }

  /* ================= 启动 ================= */
  document.addEventListener('DOMContentLoaded', () => {
    $('jpegBg').checked = true;
    bind();
    renderLists();
    renderResults();
  });

  // 调试出口（便于自动化冒烟测试）
  if (typeof window !== 'undefined') {
    window.__IMGMerge__ = { compose, buildZip, crc32, pairs, opts };
  }
})();
