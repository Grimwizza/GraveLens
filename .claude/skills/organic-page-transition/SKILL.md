# Skill: Organic Page Transition Architect

## Purpose
To orchestrate seamless, full-screen transitions between application routes that mask loading latency and mimic physical or cinematic motions (e.g., page flips, camera shutters, liquid bleeds).

## Core Logic Requirements
1. **The Interceptor:** Intercept all internal navigation clicks. Prevent default browser behavior until the "Intro" animation phase is ready.
2. **The "Wait for Both" Pattern:** - Start the Transition Intro immediately (Responsiveness).
   - Simultaneously fetch the new page data/component.
   - **Constraint:** Do not play the "Outro" (Reveal) until BOTH the animation intro is complete AND the page data is ready.
3. **Adaptive Timing:** If the network is slow, the transition should "hold" at a natural midpoint (e.g., the book page held vertical) rather than snapping or looping awkwardly.
4. **Visual Fidelity:** - Use `transform: translateZ(0)` to force GPU acceleration.
   - Use "Power4.inOut" or "Back.out" easing for an organic, non-mechanical feel.

## Implementation Instructions
When the user provides a prompt (e.g., "Flipping a book page"):
1. **Draft the Overlay:** Create a high-z-index `canvas` or `div` wrapper.
2. **Design the Sequence:** - **Intro:** Hide the current view with the effect.
   - **Transition:** Maintain the visual state while `Next.js` or `React Router` swaps the content in the background.
   - **Outro:** Reveal the new view.
3. **Performance Guardrail:** Keep animations under 800ms unless the network requires a "hold" state.