export interface Game {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: 'ARCADE' | 'PUZZLE' | 'SHOOTER';
  cover: string;
  color: 'cyan' | 'magenta' | 'yellow' | 'green';
  best: number;
  plays: string;
}

export const GAMES: Game[] = [
  {
    id: 'bloque-buster',
    title: 'BLOQUE BUSTER',
    short: 'Rebota la pelota y destruye muros de neón.',
    long: 'Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?',
    cat: 'ARCADE',
    cover: 'cover-bricks',
    color: 'cyan',
    best: 28450,
    plays: '12.4K',
  },
  {
    id: 'caida',
    title: 'CAÍDA',
    short: 'Encaja las piezas antes de que el techo te aplaste.',
    long: 'Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.',
    cat: 'PUZZLE',
    cover: 'cover-tetro',
    color: 'magenta',
    best: 184220,
    plays: '31.8K',
  },
  {
    id: 'serpentina',
    title: 'SERPENTINA',
    short: 'Crece sin morder tu propia cola.',
    long: 'Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.',
    cat: 'ARCADE',
    cover: 'cover-snake',
    color: 'green',
    best: 7820,
    plays: '9.1K',
  },
  {
    id: 'gloton',
    title: 'GLOTÓN',
    short: 'Devora puntos y escapa de los fantasmas.',
    long: 'Un círculo glotón patrulla un laberinto coleccionando puntos luminosos. Cuatro espectros lo persiguen, pero cada cierto tiempo aparece una píldora que invierte los papeles.',
    cat: 'ARCADE',
    cover: 'cover-glot',
    color: 'yellow',
    best: 96400,
    plays: '27.2K',
  },
  {
    id: 'invasores',
    title: 'INVASORES',
    short: 'Defiende el planeta de filas alienígenas.',
    long: 'Olas de pixeles hostiles descienden formación tras formación. Mueve tu cañón en horizontal y abre fuego con precisión, antes de que toquen la superficie.',
    cat: 'SHOOTER',
    cover: 'cover-invaders',
    color: 'green',
    best: 54190,
    plays: '18.0K',
  },
  {
    id: 'rocas',
    title: 'ROCAS',
    short: 'Pulveriza asteroides en gravedad cero.',
    long: 'Tu nave triangular flota en vacío absoluto. Dispara y rota para dividir rocas en fragmentos cada vez más pequeños. Cuidado con los OVNIs en el horizonte.',
    cat: 'SHOOTER',
    cover: 'cover-rocas',
    color: 'yellow',
    best: 41200,
    plays: '15.6K',
  },
];

export const CATS: ('TODOS' | Game['cat'])[] = ['TODOS', 'ARCADE', 'PUZZLE', 'SHOOTER'];
