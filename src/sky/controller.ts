import { cardinal, clampTilt, deg, fieldOfView, wrap } from './model';
import type { CameraView, SkyFrame } from './model';
import type { SkyPlot } from './renderer';

export function createFinder(setHour: (index: number) => void) {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = byId<HTMLDialogElement>('finder-dialog');
  const frame = byId('finder-frame');
  const canvas = byId<HTMLCanvasElement>('finder-canvas');
  const labels = byId('finder-labels');
  const message = byId('finder-fallback');
  const slider = byId<HTMLInputElement>('finder-hour');
  const aim = byId<HTMLButtonElement>('finder-reset');
  const playback = byId<HTMLButtonElement>('finder-play');
  const lenses = [...dialog.querySelectorAll<HTMLButtonElement>('[data-focal]')];
  const view: CameraView = { az: 180, alt: 20, focal: 24, figures:true,galaxy:true };
  const picker=byId<HTMLSelectElement>('sky-object');
  let selected='', optionKey='';
  let sky: SkyFrame | undefined;
  let plot: SkyPlot | undefined;
  let track = true, serial = 0, pendingFrame = 0;
  let status: 'loading' | 'ready' | 'failed' = 'loading';
  let playbackTimer: number | undefined;
  let drag: { id: number; x: number; y: number; az: number; alt: number } | undefined;

  function centre() {
    if (!sky) return;
    const subject=sky.subjects.find(s=>s.id===selected)??sky.target;
    view.az = wrap(subject.az);
    view.alt = subject.alt < 0 ? 4 : clampTilt(subject.alt);
  }

  function render() {
    pendingFrame = 0;
    if (!sky || !dialog.open) return;
    const lang = sky.en;
    const t = (zh: string, en: string) => lang ? en : zh;
    const key=sky.ms+'|'+sky.lat+'|'+sky.lon+'|'+lang+'|'+sky.subjectKey;
    if(optionKey!==key){
      const options=sky.subjects.slice().sort((a,b)=>b.alt-a.alt).map(s=>
        new Option(s.names[lang?1:0]+' · '+Math.round(s.alt)+'°',s.id));
      picker.replaceChildren(new Option(t('当前拍摄目标','Shooting subject'),''),...options);
      picker.value=selected;optionKey=key;
    }
    const focus=sky.subjects.find(s=>s.id===selected)??sky.target;
    byId('sky-object-position').textContent=(focus.alt<0?t('地平线下','Below horizon'):cardinal(focus.az,lang)+' '+Math.round(wrap(focus.az))%360+'°')+' · '+t('高度 ','Alt ')+Math.round(focus.alt)+'°';
    byId<HTMLInputElement>('show-figures').disabled=status!=='ready';
    byId<HTMLInputElement>('show-galaxy').disabled=status!=='ready';
    if (status === 'ready') plot?.draw(sky, view);
    frame.dataset.mode = status;
    frame.tabIndex = status === 'ready' ? 0 : -1;
    message.hidden = status === 'ready';
    if (status !== 'ready') message.textContent = status === 'failed'
      ? t('此设备暂时无法显示星图。下方保留了天体的方位与仰角。','The star chart is unavailable on this device. The bearings and altitudes are still available.')
      : t('正在加载星图…','Loading the star chart…');
    const selectedDate = new Date(sky.ms + 8*3600000).toISOString().slice(0,10);
    byId('finder-location').textContent = sky.place + ' · ' + selectedDate + ' · MYT';
    byId('finder-time').textContent = sky.clock;
    slider.value = String(sky.index);
    slider.setAttribute('aria-valuetext', sky.clock);
    playback.disabled = status !== 'ready';
    const playing = playbackTimer !== undefined;
    playback.dataset.playing = String(playing);
    byId('finder-play-label').textContent = playing ? t('暂停预演','Pause preview') : t('固定机位预演','Play fixed-camera preview');
    byId('finder-heading').textContent = t('朝向 ','Bearing ') + cardinal(view.az,lang) + ' ' + (Math.round(wrap(view.az))%360) + '°  ·  ' + t('仰角 ','Tilt ') + Math.round(view.alt) + '°';
    byId('finder-fov').textContent = Math.round(fieldOfView(36,view.focal)) + '° × ' + Math.round(fieldOfView(24,view.focal)) + '°';
    for (const button of lenses) {
      button.disabled = status !== 'ready';
      button.setAttribute('aria-pressed', String(Number(button.dataset.focal) === view.focal));
    }
    aim.disabled = status !== 'ready' || sky.target.alt < 0;
    aim.title = sky.target.alt < 0 ? t('目标在地平线下','The subject is below the horizon') : '';
    const list = byId('finder-bodies');
    list.replaceChildren();
    for (const body of [sky.target, sky.moon]) {
      const row = document.createElement('div'), name = document.createElement('span'), bearing = document.createElement('strong');
      name.textContent = body.name;
      bearing.textContent = body.alt < 0 ? t('地平线下 ','Below horizon ') + Math.round(body.alt) + '°' :
        cardinal(body.az,lang) + ' ' + (Math.round(wrap(body.az))%360) + '° · ' + t('仰角 ','Alt ') + Math.round(body.alt) + '°';
      row.append(name,bearing); list.append(row);
    }
  }

  function schedule() {
    if (dialog.open && !pendingFrame) pendingFrame = requestAnimationFrame(render);
  }

  function stopPlayback() {
    if (playbackTimer === undefined) return;
    window.clearInterval(playbackTimer);
    playbackTimer = undefined;
    schedule();
  }

  function togglePlayback() {
    if (playbackTimer !== undefined) { stopPlayback(); return; }
    if (!sky || status !== 'ready') return;
    const lastHour = Number(slider.max);
    // A tripod keeps its bearing and tilt as the sky moves through the frame.
    track = false;
    if (sky.index >= lastHour) setHour(0);
    playbackTimer = window.setInterval(() => {
      if (!sky || !dialog.open || document.hidden || status !== 'ready') { stopPlayback(); return; }
      const next = Math.min(lastHour, sky.index+1);
      setHour(next);
      if (next === lastHour) stopPlayback();
    }, 1200);
    schedule();
  }

  function release() {
    serial++;
    stopPlayback();
    plot?.dispose(); plot = undefined;
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0; drag = undefined;
    labels.replaceChildren();
  }

  async function open() {
    if (!sky || dialog.open) return;
    dialog.showModal();
    const token = ++serial;
    status = 'loading'; selected='';picker.value='';track = true; centre(); render();
    try {
      const { createSkyPlot } = await import('./renderer');
      if (!dialog.open || token !== serial) return;
      plot = createSkyPlot(canvas,labels,() => { status = 'failed'; stopPlayback(); schedule(); },() => { status = 'ready'; schedule(); },schedule);
      status = 'ready';
    } catch {
      if (!dialog.open || token !== serial) return;
      status = 'failed';
    }
    schedule();
  }

  function update(next: SkyFrame) {
    sky = next;
    if (track) centre();
    schedule();
  }

  const resize = new ResizeObserver(schedule); resize.observe(frame);
  for(const [id,key] of [['show-figures','figures'],['show-galaxy','galaxy']] as const){
    const checkbox=byId<HTMLInputElement>(id);
    checkbox.addEventListener('change',()=>{view[key]=checkbox.checked;schedule();});
  }
  picker.addEventListener('change',()=>{
    stopPlayback();selected=picker.value;track=true;
    if(selected){
      const key=selected==='galaxy'?'galaxy':'figures';
      view[key]=true;byId<HTMLInputElement>(key==='galaxy'?'show-galaxy':'show-figures').checked=true;
    }
    centre();schedule();
  });
  playback.addEventListener('click', togglePlayback);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
  slider.addEventListener('input', () => { stopPlayback(); setHour(Number(slider.value)); });
  aim.addEventListener('click', () => { stopPlayback(); selected='';picker.value='';track = true; centre(); schedule(); });
  for (const button of lenses) button.addEventListener('click', () => { view.focal = Number(button.dataset.focal); schedule(); });
  frame.addEventListener('pointerdown', event => {
    if (status !== 'ready' || !event.isPrimary || event.button !== 0) return;
    stopPlayback();
    drag = { id:event.pointerId, x:event.clientX, y:event.clientY, az:view.az, alt:view.alt };
    frame.setPointerCapture(event.pointerId); frame.focus({preventScroll:true});
  });
  frame.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const rect = frame.getBoundingClientRect();
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    track = false;
    view.az = wrap(drag.az - dx / rect.width * fieldOfView(36,view.focal) / Math.max(.3,Math.cos(drag.alt*deg)));
    view.alt = clampTilt(drag.alt + dy / rect.height * fieldOfView(24,view.focal));
    schedule();
  });
  frame.addEventListener('lostpointercapture', () => { drag = undefined; });
  frame.addEventListener('keydown', event => {
    if (status !== 'ready' || !event.key.startsWith('Arrow')) return;
    const step = event.shiftKey ? 10 : 2;
    const deltas: Record<string,[number,number]> = { ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step] };
    const delta = deltas[event.key]; if (!delta) return;
    event.preventDefault(); stopPlayback(); track = false;
    view.az = wrap(view.az + delta[0]); view.alt = clampTilt(view.alt + delta[1]); schedule();
  });
  dialog.addEventListener('close', () => { if (!dialog.open) release(); });
  return { open, update, close() { if (dialog.open) dialog.close(); } };
}
