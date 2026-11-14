import data from './data/places.json';
/* Night-sky atlas for Malaysia. Sky model: Falchi et al. (2016), model input 2014,
   CC BY-NC 4.0. Places: GeoNames, CC BY 4.0. Base map: Natural Earth, public domain.
   Full attribution, changes and units are in atlas-sources.txt. */
(() => {
  "use strict";
  let atlas, pending, state='idle';
  function load(){
    if(!pending){
      state='loading';
      pending=import('./data/sky-atlas.json').then(module=>{atlas=module.default;state='ready';}).catch(()=>{pending=null;state='unavailable';});
    }
    return pending;
  }
  const naturalMcd = 0.174;
  const gridCache = new Map();
  const naturalRatio = (code, grid) => code === 1 ? 0 : 2 ** (grid.origin + (code - 2) * grid.step);

  function loadGrid(region) {
    if (gridCache.has(region.id)) return gridCache.get(region.id);
    const grid = atlas.grids[region.id];
    const source = atob(grid.block);
    const target = new Uint8Array(grid.rows * grid.cols);
    let read = 0;
    let written = 0;
    const byte = () => source.charCodeAt(read++);
    function length(initial) {
      if (initial !== 15) return initial;
      let extra;
      do {
        extra = byte();
        initial += extra;
      } while (extra === 255);
      return initial;
    }
    while (read < source.length) {
      const token = byte();
      const literals = length(token >> 4);
      for (let i = 0; i < literals; i++) target[written++] = byte();
      if (read >= source.length) break;
      const offset = byte() + (byte() << 8);
      const match = length(token & 15) + 4;
      if (!offset || offset > written || written + match > target.length) {
        throw Error("Invalid embedded sky atlas");
      }
      for (let i = 0; i < match; i++) {
        target[written] = target[written - offset];
        written++;
      }
    }
    if (written !== target.length || read !== source.length) throw Error("Incomplete sky atlas");
    gridCache.set(region.id, target);
    return target;
  }

  function lookup(lat, lon) {
    if (typeof lat !== "number" || typeof lon !== "number" ||
        !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const region = data.regions.find(r => lon >= r.west && lon <= r.east &&
      lat >= r.south && lat <= r.north);
    if (!region || !atlas) return null;
    const grid = atlas.grids[region.id];
    const geo = atlas.georef;
    const row = Math.floor((geo.y0 - lat) / geo.dy) - grid.row0;
    const col = Math.floor((lon - geo.x0) / geo.dx) - grid.col0;
    const code = loadGrid(region)[row * grid.cols + col];
    // The source records exact zeros in remote interiors and offshore cells.
    // A zero model output cannot establish that the sky really has zero glow.
    if (code === undefined || code < 2) return null;
    const ratio = naturalRatio(code, grid);
    return { artificialMcd: ratio * naturalMcd, ratio, increasePct: ratio * 100,
      totalRatio: 1 + ratio, year: 2014, region: region.id, quality: "historical-model" };
  }

  const clean = text => String(text || "").toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const searchIndex = data.names.map(place => ({
    place,
    names: [place.name, place.zh, ...place.aliases].map(clean).filter(Boolean),
    state: [place.state, place.stateZh].map(clean),
  }));
  function search(query, limit = 8) {
    const term = clean(query);
    if (!term) return [];
    const result = [];
    for (const rec of searchIndex) {
      let rank = 0;
      if (rec.names.some(n => n === term)) rank = 4;
      else if (rec.names.some(n => n.startsWith(term))) rank = 3;
      else if (rec.names.some(n => n.includes(term))) rank = 2;
      else if (rec.state.some(n => n.includes(term))) rank = 1;
      if (rank) result.push({ rank, place: rec.place });
    }
    result.sort((a, b) => b.rank - a.rank || b.place.population - a.place.population);
    return result.slice(0, Math.max(0, Math.floor(limit))).map(r => r.place);
  }

  globalThis.AtlasGeo = Object.freeze({
    regions: data.regions, places: data.names, get map(){return atlas?.geom;}, get state(){return state;}, load, legend: data.legend,
    lookup, search,
    source: {
      year: 2014, publicationYear: 2016, unit: "mcd/m²", naturalMcd,
      nativeCellArcsec: 30, projection: "EPSG:4326", imageProjection: "EPSG:3857",
      type: "historical modelled artificial zenith luminance", license: "CC BY-NC 4.0",
      doi: "https://doi.org/10.5880/GFZ.1.4.2016.001",
      paper: "https://doi.org/10.1126/sciadv.1600377",
    },
  });
})();
