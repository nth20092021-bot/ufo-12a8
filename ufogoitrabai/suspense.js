export const SUSPENSE_STORAGE_KEY='kroma.ufo.suspense-level.v1';
export const SUSPENSE_LEVELS=Object.freeze({
  light:Object.freeze({duration:2000}),
  normal:Object.freeze({duration:4000}),
  intense:Object.freeze({duration:7000}),
});

export function normalizeSuspenseLevel(value) {
  return typeof value==='string'&&Object.hasOwn(SUSPENSE_LEVELS,value)?value:'normal';
}

/** A device preference, independent of classroom records and account sync. */
export function createSuspensePreference({storage,isBusy=()=>false}={}) {
  let level='normal';
  try {
    if(storage===undefined)storage=globalThis.localStorage;
    level=normalizeSuspenseLevel(storage?.getItem(SUSPENSE_STORAGE_KEY));
  } catch { /* Unavailable or damaged storage must not block the game. */ }
  return {
    getLevel:()=>level,
    setLevel(value) {
      if(isBusy())return {level,blocked:true,saved:false};
      level=normalizeSuspenseLevel(value);
      let saved=false;
      try { if(storage){storage.setItem(SUSPENSE_STORAGE_KEY,level);saved=true;} }
      catch { /* Keep the choice for this page even when persistence is unavailable. */ }
      return {level,blocked:false,saved};
    },
  };
}
