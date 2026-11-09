// ProcessHub 360 design tokens. Palette: millstone green (primary), turmeric (accent), cool chalk surfaces.
export const C = {
  bg: '#F3F5F4', surface: '#FFFFFF', ink: '#16232A', muted: '#5F6F73', line: '#D9DFDC',
  primary: '#14634F', primaryDark: '#0E4A3B', primarySoft: '#E1F0EB', accent: '#C98A14', accentSoft: '#FBF0D6',
  danger: '#B3261E', dangerSoft: '#FBE4E2', ok: '#2E7D32', okSoft: '#E3F2E4', info: '#2A5D84', infoSoft: '#E1EDF6',
};
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const R = { sm: 8, md: 12, lg: 16, pill: 999 };
export const FONT = { size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 26, xxl: 32 } };
// Family name registered in app/_layout.tsx from assets/fonts/UrduNastaliq.ttf (replace that file to change the Urdu font).
export const URDU_FONT = 'UrduNastaliq';
export const TOUCH = 52; // minimum control height for large, gloved-hand friendly targets
