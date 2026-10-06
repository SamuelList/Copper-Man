"""Generate the Lincoln Elementary map: src/core/level/levels/school.ts.

    python3 scripts/gen-school-map.py src/core/level/levels/school.ts && npx prettier --write src/core/level/levels/school.ts

Rooms and corridors are carved into a wall-filled grid, then every object is placed by
coordinate. Every glyph must land on floor, and wall-mounted ones are checked to touch a wall.
Mount fixtures on north or east walls where you can: the camera looks from the south-west, so
those faces are the ones you see. `npm test` runs validateLevel over the result.
"""
import json
import sys

COLS, ROWS = 92, 44
g = [['#'] * COLS for _ in range(ROWS)]
rooms = []

# Parking lot (exterior).
for r in range(ROWS):
    for c in range(0, 8):
        g[r][c] = '='
rooms.append(dict(id='parking', name='Parking Lot', kind='exterior', rect=dict(col=0, row=0, w=8, h=ROWS)))


def room(rid, name, kind, c0, r0, c1, r1, light=None):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            g[r][c] = '.'
    d = dict(id=rid, name=name, kind=kind, rect=dict(col=c0, row=r0, w=c1 - c0 + 1, h=r1 - r0 + 1))
    if light is not None:
        d['light'] = light
    rooms.append(d)


# --- Corridors (listed first so roomAt prefers the rooms they don't overlap anyway) ---
room('main-hall', 'Main Hallway', 'hallway', 9, 19, 90, 22)
room('west-hall-n', 'West Hallway', 'hallway', 30, 1, 32, 18)
room('west-hall-s', 'West Hallway', 'hallway', 30, 23, 32, 42)
room('east-hall-n', 'East Hallway', 'hallway', 60, 1, 62, 18)
room('east-hall-s', 'East Hallway', 'hallway', 60, 23, 62, 42)
room('north-hall-w', 'North Hallway', 'hallway', 9, 9, 29, 10)
room('north-hall-c', 'North Hallway', 'hallway', 33, 9, 59, 10)
room('south-hall-w', 'South Hallway', 'hallway', 9, 32, 29, 33)
room('south-hall-e', 'South Hallway', 'hallway', 63, 32, 90, 33)

# --- North-west: classrooms, office, library ---
room('class-101', 'Classroom 101', 'classroom', 9, 1, 18, 7)
room('class-102', 'Classroom 102', 'classroom', 20, 1, 28, 7)
room('office', 'Main Office', 'office', 9, 12, 18, 17)
room('library', 'Library', 'library', 20, 12, 28, 17)
# --- North-centre: restrooms, janitor, science lab, classroom ---
room('boys-room', "Boys' Restroom", 'restroom', 34, 1, 40, 7)
room('girls-room', "Girls' Restroom", 'restroom', 42, 1, 49, 7)
room('janitor', 'Janitor Closet', 'closet', 51, 1, 58, 7)
room('science-lab', 'Science Lab', 'lab', 34, 12, 48, 17)
room('class-103', 'Classroom 103', 'classroom', 50, 12, 58, 17)
# --- North-east: gym and locker room ---
room('gym', 'Gymnasium', 'gym', 64, 1, 82, 17)
room('locker-room', 'Locker Room', 'restroom', 84, 1, 90, 17)
# --- South-west: classrooms, supply, staff restroom ---
room('class-104', 'Classroom 104', 'classroom', 9, 24, 18, 30)
room('class-105', 'Classroom 105', 'classroom', 20, 24, 28, 30)
room('class-106', 'Classroom 106', 'classroom', 9, 35, 18, 42)
room('supply', 'Supply Closet', 'closet', 20, 35, 24, 42)
room('staff-room', 'Staff Restroom', 'restroom', 26, 35, 28, 42)
# --- South-centre: cafeteria, kitchen, lounge ---
room('cafeteria', 'Cafeteria', 'cafeteria', 34, 24, 50, 42)
room('kitchen', 'Kitchen', 'kitchen', 52, 24, 58, 33)
room('lounge', "Teachers' Lounge", 'lounge', 52, 35, 58, 42)
# --- South-east: music, technical rooms, boiler room ---
room('music', 'Music Room', 'classroom', 64, 24, 72, 30)
room('electrical', 'Electrical Room', 'mechanical', 74, 24, 78, 30)
room('mechanical', 'Mechanical Room', 'mechanical', 80, 24, 90, 30)
room('server', 'Server Room', 'mechanical', 64, 35, 70, 42)
room('boiler', 'Boiler Room', 'boiler', 72, 35, 90, 42)


def put(ch, c, r, need='.'):
    if g[r][c] != need:
        sys.exit(f'{ch} at {c},{r} lands on {g[r][c]!r}, expected {need!r}')
    g[r][c] = ch


def door(ch, c, r):
    put(ch, c, r, need='#')


# Hall junctions: open the walls where corridors meet.
for r in (19, 20, 21, 22):
    for c in (29, 33, 59, 63):
        if g[r][c] == '#':
            g[r][c] = '.'
for c in range(30, 33):
    for r in (18, 23):
        g[r][c] = '.'
for c in range(60, 63):
    for r in (18, 23):
        g[r][c] = '.'
for r in (9, 10):
    g[r][29] = '.'
    g[r][33] = '.'
    g[r][59] = '.'
for r in (32, 33):
    g[r][29] = '.'
    g[r][63] = '.'

# Entrances from the parking lot.
for r in (20, 21):
    door('D', 8, r)
door('D', 8, 32)

# Doors.
door('D', 14, 8)   # 101 -> north hall
door('D', 24, 8)   # 102
door('D', 14, 11)  # office -> north hall
door('D', 12, 18)  # office -> main hall
door('D', 24, 11)  # library
door('D', 26, 18)
door('D', 37, 8)   # boys
door('D', 45, 8)   # girls
door('L', 54, 8)   # janitor (locked)
door('D', 40, 11)  # lab
door('D', 44, 18)
door('D', 54, 11)  # 103
door('D', 54, 18)
door('D', 63, 6)   # gym -> east hall
door('D', 63, 13)
door('D', 72, 18)  # gym -> main hall
door('D', 83, 9)   # gym -> locker room
door('D', 87, 18)  # locker room -> main hall
door('D', 14, 23)  # 104
door('D', 24, 23)  # 105
door('D', 14, 34)  # 106
door('L', 22, 34)  # supply (locked)
door('D', 27, 34)  # staff restroom
door('D', 38, 23)  # cafeteria double doors
door('D', 39, 23)
door('D', 46, 23)
door('D', 33, 33)  # cafeteria -> west hall
door('D', 51, 28)  # cafeteria -> kitchen
door('D', 59, 28)  # kitchen -> east hall
door('D', 59, 38)  # lounge -> east hall
door('D', 68, 23)  # music
door('L', 76, 31)  # electrical (locked)
door('K', 85, 31)  # mechanical (security)
door('L', 67, 34)  # server (locked)
door('K', 80, 34)  # boiler (security)

# Van, player spawn, planters.
for c in (2, 3, 4):
    for r in (20, 21):
        put('V', c, r, need='=')
put('P', 6, 21, need='=')
for r in (3, 9, 15, 27, 36, 41):
    put('p', 7, r, need='=')

# Boss waypoints (his office, then the main halls).
put('1', 15, 15)
put('2', 46, 21)
put('3', 31, 5)
put('4', 61, 40)
put('5', 86, 20)

# ---------- North-west ----------
# Classroom 101
for c in (11, 16):
    put('R', c, 1)
for (c, r) in [(11, 3), (14, 3), (17, 3), (11, 5), (14, 5), (17, 5)]:
    put('k', c, r)
put('l', 10, 7)
put('H', 9, 6)
put('S', 13, 4)
put('S', 16, 6)
put('E', 13, 7)
# Classroom 102
for c in (22, 26):
    put('R', c, 1)
for (c, r) in [(21, 3), (24, 3), (27, 3), (21, 5), (24, 5), (27, 5)]:
    put('k', c, r)
put('l', 26, 7)
put('S', 23, 4)
put('S', 26, 6)
put('E', 22, 7)
# Main office: Mr. Gravy's turf. The trophy case is the prize.
put('X', 11, 12)
put('X', 13, 12)
put('h', 18, 12)
put('k', 10, 15)
put('l', 17, 16)
put('p', 9, 17)
put('F', 16, 12)
put('Z', 18, 17)
# Library: tall shelves everywhere.
for c in (20, 21, 22, 26, 27, 28):
    put('r', c, 12)
for r in (14, 15, 16):
    put('r', 20, r)
put('t', 23, 14)
put('t', 25, 14)
put('t', 23, 16)
put('l', 26, 16)
put('S', 24, 15)

# ---------- North-centre ----------
# Boys' restroom: urinals, a pair of stalls, sinks, a hand dryer.
put('U', 34, 1)
put('U', 35, 1)
put('U', 36, 1)
put('T', 38, 1)
put('q', 39, 1)
put('T', 40, 1)
put('W', 40, 3)
put('W', 40, 4)
put('Y', 40, 5)
put('n', 35, 6)
# Girls' restroom: three stalls, sinks, a hand dryer.
put('T', 43, 1)
put('q', 44, 1)
put('T', 45, 1)
put('q', 46, 1)
put('T', 47, 1)
put('q', 48, 1)
put('W', 49, 3)
put('W', 49, 4)
put('Y', 49, 5)
put('n', 43, 6)
# Janitor closet (locked).
put('M', 51, 1)
put('M', 53, 1)
put('h', 58, 2)
put('h', 58, 3)
put('A', 56, 1)
put('Z', 55, 6)
put('n', 51, 7)
# Science lab: benches with gas taps.
for (c, r) in [(36, 14), (39, 14), (42, 14), (36, 16), (39, 16), (42, 16)]:
    put('g', c, r)
put('R', 46, 12)
put('h', 48, 13)
put('h', 48, 14)
put('F', 34, 13)
put('E', 45, 15)
put('S', 38, 15)
put('S', 43, 17)
# Classroom 103.
put('R', 52, 12)
put('R', 56, 12)
for (c, r) in [(51, 14), (54, 14), (57, 14), (51, 16), (54, 16)]:
    put('k', c, r)
put('l', 57, 17)
put('S', 53, 15)

# ---------- North-east ----------
# Gym: bleachers along the north wall, heaters, a fountain.
for c in range(66, 81, 2):
    put('b', c, 1)
put('H', 64, 4)
put('H', 82, 4)
put('H', 82, 12)
put('F', 64, 16)
put('A', 82, 8)
put('E', 73, 9)
put('S', 70, 6)
put('S', 77, 13)
put('Z', 81, 16)
# Locker room.
for r in (3, 4, 5, 6):
    put('O', 90, r)
put('U', 85, 1)
put('U', 86, 1)
put('T', 88, 1)
put('q', 89, 1)
put('T', 90, 1)
put('W', 90, 8)
put('W', 90, 9)
put('Y', 90, 11)
put('b', 84, 12)
put('b', 84, 13)
put('O', 90, 14)
put('O', 90, 15)
put('n', 86, 16)

# ---------- Hallways ----------
# Main hall: lockers, fountains, heaters, planters, benches, bins.
for c in (10, 11, 13) + (35, 36, 37) + (48, 49, 50) + (65, 66, 67) + (78, 79, 80):
    put('O', c, 19)
for c in (16, 17, 18) + (41, 42, 43) + (55, 56, 57) + (70, 71, 72):
    put('O', c, 22)
for c in (20, 52, 75):
    put('F', c, 19)
for c in (28, 84):
    put('F', c, 22)
for c in (23, 45, 69, 88):
    put('H', c, 19)
for c in (21, 47, 83):
    put('H', c, 22)
put('p', 34, 22)
put('p', 64, 22)
put('b', 26, 22)
put('b', 53, 19)
put('n', 40, 19)
put('n', 74, 22)
# North / south halls.
for c in (17, 18, 19, 20):
    put('O', c, 9)
for c in (38, 39, 47, 48, 49):
    put('O', c, 10)
put('F', 26, 9)
put('H', 52, 9)
for c in (11, 12, 13):
    put('O', c, 33)
put('F', 18, 32)
put('H', 25, 33)
for c in (66, 67, 68, 71, 72):
    put('O', c, 32)
put('H', 88, 32)
put('F', 78, 33)
# North-south halls.
for r in (2, 3, 13, 14, 15):
    put('O', 30, r)
for r in (26, 27, 28, 37, 38):
    put('O', 32, r)
for r in (3, 4, 5, 14, 15):
    put('O', 62, r)
for r in (25, 26, 36, 37):
    put('O', 60, r)
put('F', 32, 12)
put('F', 30, 40)
put('H', 60, 12)
put('F', 62, 29)

# ---------- South-west ----------
# Classroom 104
for c in (11, 16):
    put('R', c, 30)
for (c, r) in [(11, 25), (14, 25), (17, 25), (11, 27), (14, 27), (17, 27)]:
    put('k', c, r)
put('l', 10, 24)
put('H', 18, 28)
put('S', 13, 26)
put('S', 16, 28)
put('E', 13, 29)
# Classroom 105
for c in (22, 26):
    put('R', c, 30)
for (c, r) in [(21, 25), (24, 25), (27, 25), (21, 27), (24, 27)]:
    put('k', c, r)
put('l', 27, 28)
put('S', 23, 26)
# Classroom 106
for c in (11, 16):
    put('R', c, 42)
for (c, r) in [(11, 36), (14, 36), (17, 36), (11, 38), (14, 38), (17, 38)]:
    put('k', c, r)
put('l', 10, 40)
put('H', 9, 37)
put('S', 13, 37)
put('S', 15, 40)
# Supply closet (locked)
put('h', 20, 36)
put('h', 20, 37)
put('h', 24, 38)
put('h', 24, 39)
put('C', 22, 41)
put('Z', 21, 42)
# Staff restroom
put('T', 27, 42)
put('W', 28, 36)
put('Y', 28, 38)

# ---------- South-centre ----------
# Cafeteria: rows of tables.
for c in (36, 37, 41, 42, 46, 47):
    for r in (26, 27, 31, 32, 37, 38):
        put('t', c, r)
put('F', 34, 25)
put('F', 50, 41)
put('H', 34, 35)
put('H', 50, 30)
put('n', 44, 24)
put('n', 39, 41)
put('n', 49, 35)
put('E', 44, 29)
put('S', 39, 29)
put('S', 44, 34)
put('S', 48, 39)
put('S', 36, 40)
# Kitchen: counters, the walk-in cooler's coils, a mop sink.
for c in (53, 54, 55, 56):
    put('c', c, 24)
put('J', 58, 25)
put('J', 58, 26)
put('W', 52, 30)
put('M', 52, 33)
put('h', 58, 32)
put('c', 52, 26)
put('c', 52, 27)
# Teachers' lounge.
put('t', 54, 37)
put('t', 55, 37)
put('b', 58, 36)
put('b', 58, 37)
put('k', 56, 40)
put('l', 53, 41)
put('F', 52, 35)
put('W', 52, 39)
put('Z', 57, 42)

# ---------- South-east ----------
# Music room.
put('R', 66, 30)
put('R', 70, 30)
for (c, r) in [(66, 25), (69, 25), (66, 27), (69, 27)]:
    put('k', c, r)
put('l', 71, 25)
put('S', 68, 26)
put('S', 71, 28)
# Electrical room (locked): panels need gloves.
put('G', 74, 24)
put('G', 76, 24)
put('G', 78, 24)
put('h', 78, 29)
# Mechanical room (security): the chillers need a veteran with a proper drill.
put('I', 83, 26)
put('I', 87, 26)
put('A', 80, 24)
put('A', 90, 28)
put('G', 85, 24)
# Server room (locked): racks need experience.
put('N', 64, 35)
put('N', 66, 35)
put('N', 68, 35)
put('N', 70, 36)
put('k', 66, 40)
put('l', 68, 41)
# Boiler room (security): far from the van, dark, rich.
for (c, r) in [(75, 37), (76, 37), (75, 38), (76, 38), (84, 37), (85, 37), (84, 38), (85, 38)]:
    put('B', c, r)
put('C', 79, 40)
put('C', 88, 36)
put('C', 81, 42)
put('A', 73, 35)
put('A', 90, 41)
put('Z', 89, 39)

# ---------- Checks ----------
MOUNTED = set('FHARTMUWYJGXNqbOhrc')  # wall-anchored fixtures + props (footprint anchor 'wall')
for r in range(ROWS):
    for c in range(COLS):
        ch = g[r][c]
        if ch in MOUNTED:
            touching = any(g[r + dr][c + dc] == '#' for dc, dr in ((0, -1), (-1, 0), (1, 0), (0, 1))
                           if 0 <= r + dr < ROWS and 0 <= c + dc < COLS)
            if not touching:
                print(f'warning: wall item {ch} at {c},{r} has no wall', file=sys.stderr)

lines = [''.join(row) for row in g]
for line in lines:
    assert len(line) == COLS

def ts_room(d):
    rect = d['rect']
    parts = [f"id: {json.dumps(d['id'])}", f"name: {json.dumps(d['name'])}", f"kind: '{d['kind']}'",
             f"rect: {{ col: {rect['col']}, row: {rect['row']}, w: {rect['w']}, h: {rect['h']} }}"]
    if 'light' in d:
        parts.append(f"light: {d['light']}")
    return '  { ' + ', '.join(parts) + ' },'

out = []
out.append("import { parseAsciiLevel } from '../asciiLevel';")
out.append("import type { RoomDef } from '../types';")
out.append('')
out.append('/**')
out.append(' * Lincoln Elementary, expanded. The van waits in the parking lot on the west side; the')
out.append(' * further east you go, the richer and harder the scrap:')
out.append(' * - West: classrooms, the main office (Mr. Gravy\'s turf, with a trophy case) and the library.')
out.append(' * - Centre: restrooms, the science lab, the cafeteria, kitchen and teachers\' lounge.')
out.append(' * - East: the gym and locker room, the music room, and the technical rooms: electrical')
out.append(' *   (gloves), server (experience), mechanical and boiler (security doors).')
out.append(' * Lockers, shelves, bookshelves, stalls and boilers block sight; desks, tables, benches,')
out.append(' * counters, bins and planters are cover. Generated by scripts/gen-school-map.py; edit that.')
out.append(' * See asciiLevel.ts for the legend.')
out.append(' */')
out.append('const rooms: RoomDef[] = [')
out.extend(ts_room(d) for d in rooms)
out.append('];')
out.append('')
out.append('// prettier-ignore')
out.append('const map = [')
out.extend(f"  '{line}'," for line in lines)
out.append('];')
out.append('')
out.append('export const SCHOOL_LEVEL = parseAsciiLevel({')
out.append("  id: 'school',")
out.append("  name: 'Lincoln Elementary',")
out.append('  map,')
out.append('  rooms,')
out.append("  bossRoute: '12345',")
out.append('});')
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
print('\n'.join(lines))
