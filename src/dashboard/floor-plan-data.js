export const FLOOR_NAMES = {
  1: 'The Focus Greenhouse',
  2: 'The AI Synthesis Oasis',
  3: 'The Core Solarium',
  4: 'The Sunken Amphitheater'
};

export const DIVISIONS = [
  { id: 'leadership', label: 'Leadership', color: '#2563eb' },
  { id: 'marketing', label: 'Marketing & Business', color: '#e89b1c' },
  { id: 'engineering', label: 'Engineering & Design', color: '#0f766e' },
  { id: 'service', label: 'Customer Service', color: '#7c3aed' }
];

export const FLOOR_PLANS = {
  1: {
    rooms: [
      { label: 'BAMBOO PODS', x: -8, z: -3, w: 12, d: 13, type: 'private' },
      { label: 'BOTANICAL LAB', x: -13.5, z: 2.5, w: 4, d: 4, type: 'service' },
      { label: 'SOLARIUM ENTRY', x: 7, z: 0, w: 16, d: 22, type: 'open' },
      { label: 'ZEN GARDEN', x: -7, z: 8, w: 8, d: 7, type: 'social' },
      { label: 'MEDITATION', x: -14.5, z: 10.6, w: 3, d: 3, type: 'private' },
      { label: 'GLASS WALKWAY', x: 7, z: 11, w: 7, d: 2, type: 'open' }
    ]
  },
  2: {
    rooms: [
      { label: 'TEA PAVILION', x: -3, z: -2, w: 12, d: 9, type: 'social' },
      { label: 'AI SYNTHESIS LAB', x: -1, z: 5, w: 16, d: 10, type: 'private' },
      { label: 'MATCHA BAR', x: 11.8, z: -1, w: 8, d: 8, type: 'service' },
      { label: 'CYAN OASIS', x: 11.6, z: 6.4, w: 8, d: 8, type: 'social' },
      { label: 'SERVER VAULT', x: -14.4, z: -10.5, w: 4, d: 4, type: 'private' }
    ]
  },
  3: {
    desks: [
      { name: 'Aiden Cross', group: 'leadership', x: -7.15, z: -1.45 },
      { name: 'Ravi Menon', group: 'leadership', x: -3.85, z: -1.45 },
      { name: 'Sofia Reyes', group: 'marketing', x: 3.85, z: -5.55 },
      { name: 'Mei Lin', group: 'marketing', x: 7.15, z: -5.55 },
      { name: 'Nadia Osei', group: 'marketing', x: 3.85, z: -1.45 },
      { name: 'Yuki Sato', group: 'marketing', x: 7.15, z: -1.45 },
      { name: 'Liam Novak', group: 'engineering', x: -7.15, z: 4.45 },
      { name: 'Omar Farid', group: 'engineering', x: -3.85, z: 4.45 },
      { name: 'Arjun Patel', group: 'engineering', x: -7.15, z: 8.55 },
      { name: 'Jonas Berg', group: 'engineering', x: -3.85, z: 8.55 },
      { name: 'Carlos Vega', group: 'service', x: 3.85, z: 4.45 },
      { name: 'Hana Park', group: 'service', x: 7.15, z: 4.45 },
      { name: 'Isla Murray', group: 'service', x: 3.85, z: 8.55 }
    ],
    rooms: [
      { label: 'GLASS DOME FORUM', x: -12.9, z: -9.25, w: 6, d: 5.5, type: 'private' },
      { label: 'ATRIUM LOUNGE', x: -2.6, z: -9.6, w: 7, d: 5, type: 'social' },
      { label: 'ACOUSTIC PODS', x: -13.5, z: 10.5, w: 4.5, d: 3, type: 'private' },
      { label: 'MOSS PANTRY', x: 11.8, z: -10.3, w: 5, d: 3, type: 'service' },
      { label: 'NORDIC OAK LOUNGE', x: 13.4, z: -6.7, w: 5, d: 4, type: 'social' },
      { label: 'SANCTUARY', x: 13.3, z: 10.1, w: 5.5, d: 3.5, type: 'private' },
      { label: 'RESTROOM', x: -14.45, z: -5.05, w: 3, d: 3, type: 'private' }
    ]
  },
  4: {
    rooms: [
      { label: 'KOI POND TERRACE', x: 3, z: 9, w: 13, d: 4, type: 'social' },
      { label: 'GARDEN DECK', x: 6, z: -5.5, w: 5, d: 4, type: 'open' },
      { label: 'STEPPED SEATING', x: 11.2, z: -1.3, w: 4, d: 4, type: 'social' },
      { label: 'COLD BREW BAR', x: 14.5, z: -1, w: 3, d: 7, type: 'service' },
      { label: 'OPEN PLAZA', x: -6, z: 6, w: 5, d: 4, type: 'open' },
      { label: 'YOGA MEADOW', x: 10.9, z: -8.2, w: 5, d: 4, type: 'social' },
      { label: 'SUNKEN PIT', x: 10.8, z: 5, w: 5, d: 4, type: 'social' }
    ]
  }
};