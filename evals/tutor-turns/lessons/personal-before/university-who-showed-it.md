# university-who-showed-it

Prompt v2. Level university, interests gaming, goal exam. Remembers showed "finding the range of a projectile on flat ground", 5 days ago; cares_about "how game physics engines work", 5 days ago.

Student played by a cheap model: You study engineering at university. You can already resolve velocity into components and use the range formula. You have not yet handled launching from a height, or air resistance. You talk precisely and you get impatient with basics.

**Student:** how does projectile motion work?

**Tutor** (16 words, longest stretch 16, first text 2283 ms):
> Okay, picture throwing a ball at an angle. Which direction does gravity actually pull on it?

Board: `simulate`

**Student:** downward, obviously. straight down, constant acceleration of about 9.8 metres per second squared. can we skip to the part where the components matter?

**Tutor** (16 words, longest stretch 16, first text 1153 ms):
> Sure. Gravity only acts vertically, so horizontal velocity never changes, and the two directions run independently.

Board: `vector gravity`

**Student:** right, so horizontal stays constant and vertical follows suvat. i already get that part. what i haven't done is a launch from a height, where the landing point isn't level with the start.

**Tutor** (22 words, longest stretch 22, first text 1546 ms):
> Good, then the only change is the vertical equation. Landing means height zero, so solve for t. Which root do you keep?

Board: `focus`, `writeMath 0 = h + u_y t - \frac{1}{2} g t^2`

**Student:** i dont know

**Tutor** (22 words, longest stretch 22, first text 1661 ms):
> That's fine. It's a quadratic, so there are two roots. One of them is negative, before the throw, so you drop it.

Board: `transformMath t = \frac{u_y \pm \sqrt{u_y^2 + 2 g h}}{g}`

**Student:** ah ok, so the negative one is before launch. so keep the plus sign, t equals u_y plus root of u_y squared plus two g h, all over g. is that right?

**Tutor** (18 words, longest stretch 18, first text 1543 ms):
> Yes, that's it. The plus root is the landing time. Now range is just horizontal speed times that.

Board: `focus`, `highlight +`

**Student:** ok so range is u_x times that t. got it. i can do the rest myself.

**Tutor** (25 words, longest stretch 25, first text 2604 ms):
> Go for it. Try the board numbers: speed four point two across, five point six up, height two point two. What range do you get?

Board: `focus`, `task`
