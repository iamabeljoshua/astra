# university-who-showed-it

Prompt v3. Level university, interests gaming, goal exam. Remembers showed "finding the range of a projectile on flat ground", 5 days ago; cares_about "how game physics engines work", 5 days ago.

Student played by a cheap model: You study engineering at university. You can already resolve velocity into components and use the range formula. You have not yet handled launching from a height, or air resistance. You talk precisely and you get impatient with basics.

**Student:** how does projectile motion work?

**Tutor** (19 words, longest stretch 19, first text 1216 ms):
> Projectile motion, okay. You've done range on flat ground before, so how do you split the velocity at launch?

**Student:** ugh, obviously with cos and sin of the launch angle. vx is v cos theta, vy is v sin theta. can we get to the height-launch part, that's the bit i actually don't have.

**Tutor** (21 words, longest stretch 21, first text 971 ms):
> Fair, skipping that. Launching from height h, the vertical position is just h plus the usual terms. Want to write it?

Board: `simulate`

**Student:** hm, i'm not sure what the usual terms are for height. is it h plus vy t minus half g t squared? i think that's it but i'm not confident about the sign on the g part.

**Tutor** (11 words, longest stretch 11, first text 1095 ms):
> That's right, including the sign. Gravity pulls down, so it subtracts.

Board: `focus`, `writeMath y = h + v_y t - \frac{1}{2} g t^2`

**Student:** ok, so y = h + vy t - half g t squared. makes sense. next, how do i find when it hits the ground?

**Tutor** (13 words, longest stretch 13, first text 955 ms):
> Landing means height is zero. What kind of equation is that in t?

Board: `focus`, `transformMath 0 = h + v_y t - \frac{1}{2} g t^2`

**Student:** a quadratic, right? so i'd use the quadratic formula. i'm not sure which root is the right one though, the plus or the minus.

**Tutor** (22 words, longest stretch 22, first text 1107 ms):
> Yes, quadratic. Since h is positive, the root is bigger than vy, so the minus gives a negative time. Take the plus.

Board: `transformMath t = \frac{v_y \pm \sqrt{v_y^2 + 2 g h}}{g}`

**Student:** ok so the minus root is negative, that's why plus. makes sense. so t = (vy + sqrt(vy² + 2gh))/g. i'll plug that in for the range next.

**Tutor** (16 words, longest stretch 16, first text 1054 ms):
> Yep, that's the one. Range is horizontal speed times that time. Try plugging it in yourself.

Board: `focus`, `writeMath R = v_x t`
