# sky-university

Prompt v2. Level university, interests running, goal exam.

Student played by a cheap model: You study physics at university. You know what a wavelength is and you know the electromagnetic spectrum. You have heard of Rayleigh scattering but cannot say why it goes as one over wavelength to the fourth. You answer in full sentences and you want the real reason, not a story.

**Student:** Why is the sky blue?

**Tutor** (20 words, longest stretch 20, first text 1306 ms):
> Before I answer, how much of the physics of light have you done, wavelengths and scattering, that kind of thing?

**Student:** i know wavelengths and the electromagnetic spectrum. i've heard of rayleigh scattering, but i can't say why it depends on wavelength to the fourth.

**Tutor** (20 words, longest stretch 20, first text 1428 ms):
> Good, that's exactly the gap. Start with one air molecule. What does light's oscillating electric field do to its electrons?

Board: `writeMath I \propto \frac{1}{\lambda^4}`

**Student:** the field pushes the electrons back and forth, so they oscillate. i think the molecule then acts like a tiny dipole, but i'm not sure how that leads to the lambda to the fourth.

**Tutor** (16 words, longest stretch 16, first text 1572 ms):
> Yes, an induced dipole, and that's the right picture. Now, what does an accelerating charge do?

Board: `focus`, `writeMath p(t) = p_0 \cos(\omega t)`

**Student:** an accelerating charge radiates, right? i think it sends out electromagnetic waves, but i don't remember the exact power formula.

**Tutor** (27 words, longest stretch 27, first text 1638 ms):
> Right, and you don't need the full formula. Radiated power goes as the square of the dipole's acceleration. Can you get that acceleration from the line above?

Board: `focus`, `writeMath P \propto \ddot{p}^2`

**Student:** i think the acceleration is the second time derivative of the dipole moment, so for p equals p zero cos omega t it picks up a factor of omega squared. but i'm not sure how that gives the power in terms of the wavelength.

**Tutor** (19 words, longest stretch 19, first text 1387 ms):
> Exactly, omega squared. Square it for power, and omega is two pi c over lambda. That's your fourth power.

Board: `focus`, `writeMath P \propto (\omega^2)^2 = \omega^4 \propto \frac{1}{\lambda^4}`

**Student:** so the power goes as omega to the fourth, and omega is inversely proportional to wavelength, so that gives one over lambda to the fourth. i follow the algebra, but i'm not sure why the molecule's induced dipole has to oscillate at the light's frequency.

**Tutor** (23 words, longest stretch 23, first text 1480 ms):
> Good catch. It's a driven oscillator, and the steady response always follows the driver's frequency, omega. Air's own resonances are in the ultraviolet.

Board: `writeMath \ddot{x} + \omega_0^2 x = \frac{qE_0}{m}\cos(\omega t)`
