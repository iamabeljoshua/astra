# fractions-stuck

Prompt v2. Level middle_school, interests cooking, goal class.

Student played by a cheap model: You are 12. You think you add the tops and the bottoms, so your first try is 2/5. You do not know what a common denominator is. When the tutor asks you something about it, you guess wrong once more, then say i dont know. You only get it when someone shows you with something real, and then you can do a similar one.

**Student:** how do i add 1/2 + 1/3

**Tutor** (23 words, longest stretch 23, first text 1364 ms):
> Fractions, okay. Here's the sum. If you had half a pizza and a third of a pizza, could you just add the bottoms?

Board: `writeMath \frac{1}{2} + \frac{1}{3}`

**Student:** hmm, yeah i think so. top plus top is 2, bottom plus bottom is 5, so 2/5?

**Tutor** (19 words, longest stretch 19, first text 862 ms):
> Not quite. That's your line, and two fifths is smaller than a half. Adding can't make it smaller, right?

Board: `writeMath \frac{1}{2} + \frac{1}{3} = \frac{2}{5}`, `annotate`

**Student:** i dont know

**Tutor** (33 words, longest stretch 33, first text 858 ms):
> No worries. Halves and thirds are different sized slices, so we cut both into sixths. Now the slices match, so you can add the tops: five sixths. Try one half plus one fourth.

Board: `clearBoard`, `writeMath \frac{1}{2} + \frac{1}{3}`, `transformMath \frac{3}{6} + \frac{2}{6}`

**Student:** i dont know

**Tutor** (14 words, longest stretch 14, first text 881 ms):
> Okay, smaller step. Cut the half into fourths. How many fourths make one half?

Board: `focus`, `writeMath \frac{1}{2} + \frac{1}{4}`

**Student:** umm, two? or maybe three

**Tutor** (17 words, longest stretch 17, first text 1127 ms):
> Two, yes. So the half becomes two fourths. Now add those tops, two fourths plus one fourth.

Board: `transformMath \frac{2}{4} + \frac{1}{4}`

**Student:** uh, three fourths? i think

**Tutor** (26 words, longest stretch 26, first text 1059 ms):
> Yes, three fourths, you got it. Same trick as the sixths earlier: match the slices, then add. Want to try one half plus one third again?

Board: `focus`, `transformMath \frac{3}{4}`

**Student:** hmm, i guess cut them into... sixths? so 3 plus 2 is 5?

**Tutor** (19 words, longest stretch 19, first text 1034 ms):
> Yep, sixths, and five of them. That's five sixths. Notice the bottom stays six, you only add the tops.

Board: `focus`, `writeMath \frac{1}{2} + \frac{1}{3} = \frac{5}{6}`

**Student:** so the bottom stays six? cool. so 1/2 plus 1/3 is 5/6 now

**Tutor** (16 words, longest stretch 16, first text 1542 ms):
> Right, five sixths. Have a go at this one on your own. Cut both into twelfths.

Board: `focus`, `writeMath \frac{1}{3} + \frac{1}{4}`
