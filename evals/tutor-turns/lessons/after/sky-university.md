# sky-university

Prompt v2. Level university, interests running, goal exam.

Student played by a cheap model: You study physics at university. You know what a wavelength is and you know the electromagnetic spectrum. You have heard of Rayleigh scattering but cannot say why it goes as one over wavelength to the fourth. You answer in full sentences and you want the real reason, not a story.

**Student:** Why is the sky blue?

**Tutor** (20 words, longest stretch 20, first text 1085 ms):
> Before I explain, how much of the physics of light have you done, wavelengths and scattering, that sort of thing?

**Student:** i know what a wavelength is and roughly where visible light sits on the electromagnetic spectrum. i've heard of rayleigh scattering too, but i can't say why it depends on wavelength the way it does. i'd like the real reason, not a story.

**Tutor** (21 words, longest stretch 21, first text 1059 ms):
> Fair. Scattered intensity goes as one over wavelength to the fourth. Do you know why a molecule scatters light at all?

Board: `writeMath I \propto \frac{1}{\lambda^4}`

**Student:** i think it has something to do with the electric field pushing the electrons around, but i'm not sure how that makes it scatter. i don't really know why the wavelength dependence comes out as the fourth power.

**Tutor** (19 words, longest stretch 19, first text 1863 ms):
> You've got the start of it. The light's field shakes the electrons, so they oscillate and become tiny antennas.

Board: `focus`, `writeMath \ddot{p} \propto \omega^2 E_0`

**Student:** so the electrons oscillate and radiate, like tiny dipoles. the acceleration is what matters, right? and i guess the field gets multiplied by omega squared, which is why higher frequency gets scattered more.

**Tutor** (23 words, longest stretch 23, first text 1384 ms):
> Yes, acceleration is what radiates. That omega squared is in the field. Intensity goes as the field squared, so what power of omega?

Board: `focus`, `highlight \omega^2`

**Student:** intensity goes as the square of the field, so the field has omega squared and squaring it gives omega to the fourth. is that right? i think i'm just applying the rule, though. i still don't see why the field gets omega squared in the first place.

**Tutor** (16 words, longest stretch 16, first text 1347 ms):
> Right, omega to the fourth. Differentiate twice and each derivative brings down a factor of omega.

Board: `focus`, `transformMath p = p_0 \cos \omega t \Rightarrow \ddot{p} = -\omega^2 p`

**Student:** so for a sinusoid, each time you differentiate you get another omega, so two derivatives gives omega squared. that makes sense for the dipole. i still don't see why the frequency goes into the scattered field that way, though. and why is it one over lambda to the fourth rather than something else?

**Tutor** (23 words, longest stretch 23, first text 1301 ms):
> The radiated field is proportional to the dipole's acceleration, so it inherits that omega squared. And omega is two pi c over lambda.

Board: `focus`, `transformMath I \propto \omega^4 \propto \frac{1}{\lambda^4}`
