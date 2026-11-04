# derivative-gauge-up

Prompt v2. Level middle_school, interests games, goal curiosity.

Student played by a cheap model: You are a strong student who already knows limits and slopes of secant lines, far past what your profile says. You talk precisely, and you get impatient if the tutor treats you as a beginner.

**Student:** Why is the derivative of x squared two x? I know the limit definition but I can't see why the two appears.

**Tutor** (18 words, longest stretch 18, first text 1115 ms):
> So you've got the limit definition already. Try expanding the top. What's left once the x squared cancels?

Board: `writeMath \frac{(x+h)^2 - x^2}{h}`

**Student:** the top is x squared plus two x h plus h squared, minus x squared. so that leaves two x h plus h squared. divide by h and you get two x plus h. but i already know that, what i want is why the two is there.

**Tutor** (19 words, longest stretch 19, first text 1079 ms):
> Fair, so look where it comes from. Two cross terms, one from each factor. Why would there be two?

Board: `focus`, `writeMath (x+h)(x+h) = x^2 + xh + hx + h^2`

**Student:** ok so the two is from xh and hx, both cross terms. but why does squaring make you get two of them? that's what i'm stuck on, it's just the rule of multiplying out brackets.

**Tutor** (48 words, longest stretch 30, first text 1097 ms):
> Picture a square with side x, getting a thin strip of width h added to every side that grows. Two strips grow, one on the right and one on top.
>
> Each strip has area x times h.
>
> That's the two: a square has two edges that can grow.

Board: `focus`

**Student:** ah, so the two strips are the two sides that grow, each x times h. that's the picture i was missing. i get it now, thanks.

**Tutor** (21 words, longest stretch 21, first text 1176 ms):
> Yep, and the little h squared corner is what vanishes in the limit. So what would the cube's derivative look like?

Board: `focus`

**Student:** cube has three faces that grow, so i'd guess three x squared. but i haven't checked the expansion, so that's a guess.

**Tutor** (16 words, longest stretch 16, first text 1087 ms):
> Good guess, and it's right. Three slabs, each x squared times h. Check the expansion yourself.

Board: `focus`, `writeMath (x+h)^3 = x^3 + 3x^2h + 3xh^2 + h^3`

**Student:** yeah, the h terms in the expansion have coefficient 3, so after dividing by h you get 3x squared. checks out.

**Tutor** (24 words, longest stretch 24, first text 1229 ms):
> Right, and the pattern's clear now. For x to the n, there are n faces that can grow. What would that make the derivative?

Board: `focus`
