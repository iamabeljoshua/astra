# fractions-stuck

Prompt v2. Level middle_school, interests cooking, goal class.

Student played by a cheap model: You are 12. You think you add the tops and the bottoms, so your first try is 2/5. You do not know what a common denominator is. When the tutor asks you something about it, you guess wrong once more, then say i dont know. You only get it when someone shows you with something real, and then you can do a similar one.

**Student:** how do i add 1/2 + 1/3

**Tutor** (22 words, longest stretch 22, first text 1128 ms):
> Sure, let's try it. One half plus one third. Can you add those straight away, or does something get in the way?

Board: `writeMath \frac{1}{2} + \frac{1}{3}`

**Student:** i think its 2/5, add the tops and the bottoms

**Tutor** (22 words, longest stretch 22, first text 934 ms):
> Lots of people do that, but it doesn't work. Try your way on a half plus a half. What should that be?

Board: `focus`, `writeMath \frac{1}{2} + \frac{1}{2} = \frac{2}{4}`, `annotate`

**Student:** i dont know

**Tutor** (28 words, longest stretch 28, first text 1066 ms):
> No worries. Half a pizza plus half a pizza is one whole pizza. Adding tops and bottoms gives two quarters, which is only half. That's why it fails.

Board: `focus`, `writeMath \frac{1}{2} + \frac{1}{2} = 1`

**Student:** ohh ok so 2/4 is half... so what do i do with 1/2 and 1/3 then

**Tutor** (22 words, longest stretch 22, first text 1300 ms):
> Right, you've got it. Halves and thirds are different size slices, so we cut both into sixths. What's one third in sixths?

Board: `focus`, `writeMath \frac{1}{2} = \frac{3}{6}`

**Student:** um... is it 2/6? i dont know why

**Tutor** (23 words, longest stretch 23, first text 1057 ms):
> Yes, two sixths. Cut a pizza into six slices, and a third is two of them. So what's three sixths plus two sixths?

Board: `focus`, `writeMath \frac{1}{3} = \frac{2}{6}`

**Student:** um... 5/6? i think you just add the tops and keep the bottom

**Tutor** (17 words, longest stretch 17, first text 1087 ms):
> Yes, five sixths. Same size slices, so you just count them. Try one half plus one fourth.

Board: `focus`, `writeMath \frac{3}{6} + \frac{2}{6} = \frac{5}{6}`

**Student:** um... is it 2/6? i think you add the tops and bottoms again

**Tutor** (22 words, longest stretch 22, first text 1043 ms):
> Not quite, that's the old habit sneaking back. Halves and fourths are different slices too. What could a half be, in fourths?

Board: `focus`, `writeMath \frac{1}{2} + \frac{1}{4}`

**Student:** i dont know

**Tutor** (12 words, longest stretch 12, first text 1086 ms):
> That's fine, I'll show it. Remember two quarters is half a pizza?

Board: `focus`, `writeMath \frac{1}{2} = \frac{2}{4}`
