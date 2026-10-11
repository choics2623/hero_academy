import { buildContent, type Content } from '../src/engine';

/** 테스트용 작은 세계. 덮어쓰고 싶은 파일만 넘긴다. */
export function tiny(files: Record<string, unknown> = {}): Content {
  return buildContent({
    files: {
      'rules.yaml': {
        calendar: { start: '1.3.1', end: '1.4.4', weeks_per_month: 4, slots: ['낮', '밤'] },
        base_stats: { 힘: 10, 지성: 10 },
        clamps: { 'affinity.*': [0, 100] },
        speakers: ['속마음'],
      },
      'origins.yaml': [{ id: '평민', points: 5 }],
      'talents.yaml': [
        { id: '강골', cost: 3, excludes: ['병약'], effects: ['growth.힘 += 0.5'] },
        { id: '병약', cost: -4, excludes: ['강골'] },
        { id: '불운', cost: -13 },
      ],
      'activities.yaml': [
        { id: '훈련', name: '훈련', effects: ['stat.힘 += 2'] },
        { id: '산책', name: '산책', lines: ['바람이 분다.'] },
      ],
      'characters.yaml': [{ id: 'liana', name: '리아나' }],
      ...files,
    },
  });
}

export const BUILD = { name: '나', origin: '평민', talents: [] };
