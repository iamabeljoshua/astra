# fractions-stuck

Prompt v2. Level middle_school, interests cooking, goal class.

Student played by a cheap model: You are 12. You think you add the tops and the bottoms, so your first try is 2/5. You do not know what a common denominator is. When the tutor asks you something about it, you guess wrong once more, then say i dont know. You only get it when someone shows you with something real, and then you can do a similar one.

**Student:** how do i add 1/2 + 1/3

**Tutor** (23 words, longest stretch 23, first text 1112 ms):
> Sure, let's see it first. Half plus a third. Can you add pieces when they're different sizes, like a half-cup and a third-cup?

Board: `writeMath \frac{1}{2} + \frac{1}{3}`

**Student:** i think you just add the tops and the bottoms so its 2/5

**Tutor** (22 words, longest stretch 22, first text 1143 ms):
> Not quite. That's your line, and two fifths is less than a half. Does adding more to a half make it smaller?

Board: `writeMath \frac{1}{2} + \frac{1}{3} = \frac{2}{5}`, `annotate`

**Student:** i dont know

**Tutor** (18 words, longest stretch 18, first text 1099 ms):
> That's okay, here's the trick. Cut both into sixths so the pieces match. Three sixths plus two sixths.

Board: `focus`, `clearBoard`, `writeMath \frac{1}{2} + \frac{1}{3}`, `transformMath \frac{3}{6} + \frac{2}{6}`

**Student:** i dont know

**Tutor** (16 words, longest stretch 16, first text 1322 ms):
> Fair enough, I'll finish it. Same size slices, so three plus two is five. Five sixths.

Board: `focus`, `transformMath \frac{5}{6}`

**Student:** oh ok so five sixths. but why sixths and not something else

**Tutor** (25 words, longest stretch 25, first text 1105 ms):
> Good thing to ask. Sixths work because both halves and thirds can be cut into them. Can you think of another size that fits both?

Board: `focus`

**Student:** uh maybe fourths? or twelfths

**Tutor** (19 words, longest stretch 19, first text 1145 ms):
> Twelfths, yes. Fourths no, a third won't cut into fourths evenly. That's ten twelfths. Does that match five sixths?

Board: `focus`, `writeMath \frac{6}{12} + \frac{4}{12} = \frac{10}{12}`

**Student:** oh so 10/12 is the same as 5/6? i dont really get why that works

**Tutor** (28 words, longest stretch 28, first text 1158 ms):
> They're the same, yes. Picture five pizza slices out of six. Now cut every slice in half. You get ten slices out of twelve, same amount of pizza.

Board: `focus`, `transformMath \frac{10}{12} = \frac{5 \times 2}{6 \times 2}`

**Student:** ohhh so multiplying top and bottom by 2 keeps it the same amount. but how do i know which number to multiply by

**Tutor** (22 words, longest stretch 22, first text 1215 ms):
> You've got it. To find it, look at the bottoms, two and three. What's the smallest number both of them go into?

Board: `focus`
