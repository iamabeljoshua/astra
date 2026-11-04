# university-who-showed-it

Prompt v3. Level university, interests gaming, goal exam. Remembers showed "finding the range of a projectile", 5 days ago; cares_about "game physics", 5 days ago.

Student played by a cheap model: You study engineering at university. You can already resolve velocity into components and use the range formula. You have not yet handled launching from a height, or air resistance. You talk precisely and you get impatient with basics.

**Student:** how does projectile motion work?

**Tutor** (15 words, longest stretch 15, first text 1559 ms):
> Throw a ball sideways and watch it. Does it keep going straight, or curve down?

**Student:** it curves down, obviously. gravity pulls it down while it keeps moving forward. i know that part, i just need the full setup for launches from a height.

**Tutor** (23 words, longest stretch 23, first text 2251 ms):
> Fair enough. You've already done range, so here's the height version. Vertical position starts at launch height, h. Horizontal is just constant speed.

Board: `writeMath y = h + v_y t - \frac{1}{2} g t^2`

**Student:** ok, so the vertical term has the +h offset and the usual v_y t minus half g t squared. horizontal is just v_x t. wait, when does it hit the ground? is that where y equals zero?

**Tutor** (15 words, longest stretch 15, first text 1772 ms):
> Yes, set y to zero. That's a quadratic in t. Which root do you keep?

Board: `focus`, `writeMath 0 = h + v_y t - \frac{1}{2} g t^2`

**Student:** the positive one, obviously. the negative root is before launch. i can solve the quadratic, i just haven't done the height case with the offset yet, so i'd want to check the sign on h.

**Tutor** (22 words, longest stretch 22, first text 2254 ms):
> Good instinct to check it. Plus h is right, since y is height above the ground. Have a go at the roots.

Board: `focus`, `highlight h`

**Student:** ok so rearranging gives t squared minus two v_y over g times t minus two h over g equals zero. quadratic formula, t equals v_y over g plus or minus root of v_y squared over g squared plus two h over g. keep the plus sign. i think that's right.

**Tutor** (17 words, longest stretch 17, first text 1538 ms):
> Yes, that's right. Now a notch harder: what launch angle gives the longest range from a height?

Board: `focus`, `writeMath t = \frac{v_y}{g} + \sqrt{\frac{v_y^2}{g^2} + \frac{2h}{g}}`

**Student:** hmm, from a height the best angle isn't 45 degrees anymore, is it? i'd guess somewhere below 45, but i haven't actually worked it out. i'd have to differentiate the range expression to be sure.

**Tutor** (20 words, longest stretch 20, first text 2914 ms):
> Below forty-five is right. Write range as vx times t, with vx and vy in terms of speed and angle.

Board: `focus`
