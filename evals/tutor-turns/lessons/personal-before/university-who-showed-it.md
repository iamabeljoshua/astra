# university-who-showed-it

Prompt v2. Level university, interests gaming, goal exam. Remembers showed "finding the range of a projectile on flat ground", 5 days ago; cares_about "how game physics engines work", 5 days ago.

Student played by a cheap model: You study engineering at university. You can already resolve velocity into components and use the range formula. You have not yet handled launching from a height, or air resistance. You talk precisely and you get impatient with basics.

**Student:** how does projectile motion work?

**Tutor** (21 words, longest stretch 21, first text 1967 ms):
> Sure. Something thrown just has two motions running independently, sideways and vertical. Which of the two do you think gravity touches?

**Student:** vertical, obviously. gravity pulls down, so the vertical component changes and the horizontal one doesn't, ignoring drag. can we skip to launching from a height though, that's the bit i haven't done.

**Tutor** (20 words, longest stretch 20, first text 1762 ms):
> Right, skipping ahead. Here it's thrown from two point two metres up. What do you think changes about the landing?

Board: `simulate`

**Student:** the range gets longer, right? more time in the air means more horizontal distance. but i'd want to actually work out the time to hit the ground, not just guess.

**Tutor** (21 words, longest stretch 21, first text 1388 ms):
> Yes, longer range. That's height against time, and it hits the ground when y is zero. What would you set up?

Board: `focus`, `writeMath y = 2.2 + 5.6t - 4.9t^2`

**Student:** so set y to zero: 0 = 2.2 + 5.6t - 4.9t². that's a quadratic, so i'd use the formula and take the positive root.

**Tutor** (16 words, longest stretch 16, first text 1495 ms):
> Exactly, and the other root is negative, before the throw. Have a go at the working.

Board: `focus`, `task`

**Student:** right, so t = [-5.6 ± √(5.6² + 4×4.9×2.2)] / (2×(-4.9)). hang on, i need to check the signs before i trust that.

**Tutor** (17 words, longest stretch 17, first text 1069 ms):
> Good instinct to check. Which number is c, and what sign does it have inside the root?

Board: `focus`

**Student:** c is two point two, positive. so the discriminant is b squared minus four times a times c, and a is minus four point nine, so minus four times minus four point nine times two point two is plus, which is why i wrote plus. it's a bit of a mess though, i'd rather just redo it cleanly.

**Tutor** (13 words, longest stretch 13, first text 1283 ms):
> Your signs are right, so the plus is correct. Redo it cleanly, then.

Board: `focus`, `task`
