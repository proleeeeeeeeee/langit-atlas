// Local suggestions and coordinates stay available alongside the online place search.
(() => {
  'use strict';
  const map = window.AtlasMap;
  const t = (zh,en) => window.AtlasLang?.pick(zh,en) ?? zh;
  let form, input, list, status, submitControl, onPick, onLookup;
  let matches = [], active = -1, expanded = false, message = '';

  function announce(key) {
    message = key;
    const messages = {
      '': '',
      empty: t('请先输入地名或经纬度。','Enter a place name or coordinates first.'),
      none: t('没有匹配地名。可换个名称、输入坐标，或自行点选地图。','No places match. Try another name, enter coordinates, or choose a point on the map.'),
      invalid: t('请输入十进制度数，先纬度，再经度。','Enter decimal coordinates with latitude first, then longitude.'),
      outside: t('坐标超出马来半岛和东马图幅。','These coordinates are outside the Peninsular Malaysia and East Malaysia map coverage.'),
      choose: t('有多个匹配地点，请选择其中一个。','Several locations match. Choose one from the list.')
    };
    status.textContent = messages[key] || '';
    if (['empty','none','invalid','outside'].includes(key)) input.setAttribute('aria-invalid','true');
    else input.removeAttribute('aria-invalid');
  }

  function closeList() {
    matches = []; active = -1; expanded = false;
    list.hidden = true; list.replaceChildren();
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
  }
  function highlight(index,scroll) {
    active = index;
    for (let i = 0; i < list.children.length; i++) {
      list.children[i].setAttribute('aria-selected',String(i === active));
    }
    if (active < 0 || !list.children[active]) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    const item = list.children[active];
    input.setAttribute('aria-activedescendant',item.id);
    if (scroll) item.scrollIntoView({block:'nearest'});
  }
  function renderList(found, selected = -1) {
    list.replaceChildren();
    matches = found.places;
    expanded = matches.length > 0;
    list.hidden = !expanded;
    input.setAttribute('aria-expanded',String(expanded));
    matches.forEach((place,index) => {
      const option = document.createElement(list.matches('ul,ol') ? 'li' : 'div');
      const name = document.createElement('span'), detail = document.createElement('small');
      option.id = 'location-option-' + index;
      option.className = 'location-option';
      option.setAttribute('role','option');
      option.dataset.index = String(index);
      name.className = 'location-option-name';
      name.textContent = map.resultText(place);
      detail.className = 'location-option-detail';
      const coords = map.coord(place.lat,place.lon);
      detail.textContent = place.custom ? coords : map.stateOf(place);
      if (matches.some((other,i) => i !== index && map.nameOf(other) === map.nameOf(place) &&
                                        map.stateOf(other) === map.stateOf(place))) {
        detail.textContent = [detail.textContent,coords].filter(Boolean).join(' · ');
      }
      option.append(name,detail);
      list.append(option);
    });
    highlight(selected >= 0 && selected < matches.length ? selected : -1, false);
  }
  function query(submitted) {
    const found = map.searchPlaces(input.value,8);
    renderList(found);
    const key = found.status === 'matches' ? '' : found.status;
    announce(key === 'empty' && !submitted ? '' : key);
    return found;
  }
  function accept(place) {
    if (!place || !map.areaFor(place.lat,place.lon)) return;
    reset();
    onPick({...place});
  }
  function submit(event) {
    event.preventDefault();
    if (expanded && active >= 0) { accept(matches[active]); return; }
    const found = query(true);
    if(input.value.trim().length>=2 && !['outside','invalid'].includes(found.status) && !found.places[0]?.custom){
      closeList();onLookup(input.value.trim());return;
    }
    if (found.places.length === 1 && !found.hasMore) { accept(found.places[0]); return; }
    if (found.places.length > 1) announce('choose');
    input.focus({preventScroll:true});
  }
  function keydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      if (expanded || message) {
        event.preventDefault(); event.stopPropagation();
        closeList(); announce('');
      }
      return;
    }
    if (event.key === 'Enter') { submit(event); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!expanded) query(false);
    if (!matches.length) return;
    event.preventDefault();
    const down = event.key === 'ArrowDown';
    const next = active < 0 ? (down ? 0 : matches.length-1) :
      (active + (down ? 1 : -1) + matches.length) % matches.length;
    highlight(next,true);
  }
  function relabel() {
    if (!form) return;
    list.setAttribute('aria-label',t('匹配地点','Matching locations'));
    const previous = message;
    if (expanded) renderList(map.searchPlaces(input.value,8),active);
    announce(previous);
  }
  function reset() {
    if (!form) return;
    input.value = ''; closeList(); announce('');
  }
  function init(callback,lookup) {
    if (typeof callback !== 'function') throw new TypeError('PlacePicker.init requires a selection callback');
    onPick = callback;onLookup=lookup;
    if (form) return;
    form = document.getElementById('location-form');
    input = document.getElementById('location-search');
    list = document.getElementById('location-options');
    status = document.getElementById('location-status');
    submitControl = document.getElementById('location-submit');
    if (![form,input,list,status,submitControl].every(Boolean)) throw new Error('Location picker markup is incomplete');
    input.setAttribute('role','combobox');
    input.setAttribute('aria-controls',list.id);
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-haspopup','listbox');
    input.setAttribute('autocomplete','off');
    if (!input.hasAttribute('aria-describedby')) input.setAttribute('aria-describedby',status.id);
    list.setAttribute('role','listbox');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.setAttribute('aria-atomic','true');
    submitControl.type = 'submit';
    form.noValidate = true;
    input.addEventListener('input',event => { if (!event.isComposing) query(false); });
    input.addEventListener('compositionend',() => query(false));
    input.addEventListener('keydown',keydown);
    form.addEventListener('submit',submit);
    form.addEventListener('focusout',event => {
      if (event.relatedTarget && !form.contains(event.relatedTarget)) closeList();
    });
    list.addEventListener('pointerdown',event => {
      if (event.pointerType === 'mouse' && event.target.closest('[role=option]')) event.preventDefault();
    });
    list.addEventListener('click',event => {
      const item = event.target.closest('[role=option]');
      if (item && list.contains(item)) accept(matches[Number(item.dataset.index)]);
    });
    document.addEventListener('pointerdown',event => {
      if (!form.contains(event.target) && expanded) closeList();
    });
    reset(); relabel();
  }
  window.PlacePicker = Object.freeze({init,relabel,reset});
})();
