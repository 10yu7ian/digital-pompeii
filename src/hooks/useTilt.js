import { useRef } from "react";
import { useMotionValue, useSpring, useTransform } from "framer-motion";

export function useTilt(strength = 14) {
  const ref = useRef(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const springCfg = { stiffness: 280, damping: 28 };
  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [strength, -strength]), springCfg);
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-strength, strength]), springCfg);
  const scale   = useSpring(1, { stiffness: 280, damping: 28 });
  const glowX   = useTransform(rawX, [-0.5, 0.5], [0, 100]);
  const glowY   = useTransform(rawY, [-0.5, 0.5], [0, 100]);

  const onMouseMove = (e) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    rawX.set((e.clientX - r.left) / r.width  - 0.5);
    rawY.set((e.clientY - r.top)  / r.height - 0.5);
    scale.set(1.025);
  };

  const onMouseLeave = () => {
    rawX.set(0);
    rawY.set(0);
    scale.set(1);
  };

  return { ref, rotateX, rotateY, scale, glowX, glowY, onMouseMove, onMouseLeave };
}
