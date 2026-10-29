"use client";

import React, { useState, useEffect } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";

interface CheckIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
}

const CheckIcon = ({ size = 16, strokeWidth = 3, ...props }: CheckIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const OTPSuccess = () => {
  return (
    <div className="flex items-center justify-center gap-4 w-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 500, damping: 30 }}
        className="w-16 h-16 bg-green-500 ring-4 ring-green-100 dark:ring-green-900 text-white flex items-center justify-center rounded-full"
      >
        <CheckIcon size={32} strokeWidth={3} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="text-green-600 dark:text-green-400 font-semibold text-lg"
      >
        Xác thực thành công!
      </motion.p>
    </div>
  );
};

const OTPError = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="text-center text-red-500 dark:text-red-400 font-medium mt-2 absolute -bottom-8 w-full"
    >
      Mã OTP không đúng. Thử lại nhé.
    </motion.div>
  );
};

interface OTPInputBoxProps {
  index: number;
  verifyOTP: () => void;
  state: string;
  stiffness?: number;
  damping?: number;
  y?: number;
  opacity?: number;
}

const OTPInputBox = ({
  index,
  verifyOTP,
  state,
  stiffness = 700,
  damping = 20,
  y = 10,
  opacity = 0,
}: OTPInputBoxProps) => {
  const animationControls = useAnimationControls();
  const springTransition = {
    type: "spring" as const,
    stiffness,
    damping,
    delay: index * 0.05,
  };
  const noDelaySpringTransition = {
    type: "spring" as const,
    stiffness,
    damping,
  };
  const slowSuccessTransition = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    delay: index * 0.06,
  };

  useEffect(() => {
    animationControls.start({
      opacity: 1,
      y: 0,
      transition: springTransition,
    });
    return () => animationControls.stop();
  }, []);

  useEffect(() => {
    if (state === "success") {
      const transitionX = index * 52; 
      animationControls.start({
        x: -transitionX,
        transition: slowSuccessTransition,
      });
    }
  }, [state, index, animationControls]);

  const onFocus = () => {
    animationControls.start({ y: -5, transition: noDelaySpringTransition });
  };

  const onBlur = () => {
    animationControls.start({ y: 0, transition: noDelaySpringTransition });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    if (e.key === "Backspace" && !value && index > 0) {
      document.getElementById(`input-${index - 1}`)?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      document.getElementById(`input-${index - 1}`)?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      document.getElementById(`input-${index + 1}`)?.focus();
    }
  };

  const onInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const value = target.value;
    if (value.match(/^[0-9]$/)) {
      target.value = value;
      if (index < 5) {
        document.getElementById(`input-${index + 1}`)?.focus();
      }
    } else {
      target.value = "";
    }
    setTimeout(verifyOTP, 10);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim().slice(0, 6);
    const digits = pastedData.split("").filter((char: string) => /^[0-9]$/.test(char));

    digits.forEach((digit: string, i: number) => {
      const targetIndex = index + i;
      if (targetIndex < 6) {
        const input = document.getElementById(`input-${targetIndex}`) as HTMLInputElement | null;
        if (input) {
          input.value = digit;
        }
      }
    });

    const nextFocusIndex = Math.min(index + digits.length, 5);
    document.getElementById(`input-${nextFocusIndex}`)?.focus();
    
    setTimeout(verifyOTP, 10);
  };

  return (
    <motion.div
      className={`w-10 sm:w-11 h-14 rounded-xl border-2 overflow-hidden transition-all duration-300 shadow-sm ${
        state === "error"
          ? "border-rose-400 bg-rose-50"
          : state === "success"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-200 bg-slate-100 hover:border-slate-300 hover:bg-slate-200 focus-within:border-purple-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-purple-100"
      }`}
      initial={{ opacity, y }}
      animate={animationControls}
    >
      <input
        id={`input-${index}`}
        type="text"
        inputMode="numeric"
        maxLength={1}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        className="w-full h-full text-center text-2xl sm:text-3xl font-bold outline-none caret-purple-600 bg-transparent disabled:opacity-100 text-slate-800"
        disabled={state === "success"}
      />
    </motion.div>
  );
};

export interface OTPVerificationProps {
  userEmail?: string;
  onComplete?: (code: string) => Promise<boolean> | boolean;
  onResend?: () => void;
  stiffness?: number;
  damping?: number;
  y?: number;
  opacity?: number;
}

export function OTPVerification({
  userEmail = "email_cua_ban@gmail.com",
  onComplete,
  onResend,
  stiffness = 700,
  damping = 20,
  y = 10,
  opacity = 0,
}: OTPVerificationProps) {
  const [state, setState] = useState("idle");
  const [countdown, setCountdown] = useState(60);
  const [isResendDisabled, setIsResendDisabled] = useState(true);
  const animationControls = useAnimationControls();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isResendDisabled) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsResendDisabled(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isResendDisabled]);

  const getCode = () => {
    let code = "";
    for (let i = 0; i < 6; i++) {
      const input = document.getElementById(`input-${i}`) as HTMLInputElement | null;
      if (input) code += input.value;
    }
    return code;
  };

  const verifyOTP = async () => {
    const code = getCode();
    if (code.length < 6) {
      if (state === "error") setState("idle");
      return;
    }

    setState("loading");

    if (onComplete) {
      const isSuccess = await onComplete(code);
      if (isSuccess) {
        setState("success");
      } else {
        errorAnimation();
      }
    } else {
      if (code === "123456") {
        setState("success");
      } else {
        errorAnimation();
      }
    }
  };

  const errorAnimation = async () => {
    setState("error");
    await animationControls.start({
      x: [0, 5, -5, 5, -5, 0],
      transition: { duration: 0.3 },
    });
    
    setTimeout(() => {
      setState("idle");
    }, 1500);
  };

  const handleResend = () => {
    setCountdown(60);
    setIsResendDisabled(true);
    if (onResend) onResend();
  };

  return (
    <div
      className="rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-xl relative overflow-hidden"
      style={{
        backgroundImage: "url(https://cdn.21st.dev/assets/localized/16c55696aea9e60fe904ded95cfa9615f3dd5850411f794c155beb28679fd3a4.gif)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 bg-white/90 dark:bg-black/90 rounded-3xl backdrop-blur-sm"></div>

      <div className="relative z-10">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center shadow-inner">
            <div className="flex space-x-1 animate-pulse">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <div className="w-2 h-2 bg-purple-300 rounded-full"></div>
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-center text-gray-900 dark:text-white mb-2">
          {state === "success" ? "Tuyệt vời!" : "Xác Thực Két Sắt"}
        </h1>

        <AnimatePresence mode="wait">
          {state === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center"
              style={{ height: "232px" }} 
            >
              <OTPSuccess />
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-center text-gray-600 dark:text-gray-300 mt-2 mb-8 text-sm">
                Chúng tôi vừa gửi mã 6 số đến email
                <br />
                <span className="font-semibold text-purple-600 dark:text-purple-400">
                  {userEmail}
                </span>
              </p>

              <div className="flex flex-col items-center justify-center gap-2 mb-10 relative h-20">
                <motion.div
                  animate={animationControls}
                  className="flex items-center justify-center gap-2"
                >
                  {Array.from({ length: 6 }).map((_, index) => (
                    <OTPInputBox
                      key={`input-${index}`}
                      index={index}
                      verifyOTP={verifyOTP}
                      state={state}
                      stiffness={stiffness}
                      damping={damping}
                      y={y}
                      opacity={opacity}
                    />
                  ))}
                </motion.div>
                <AnimatePresence>
                  {state === "error" && <OTPError />}
                </AnimatePresence>
              </div>

              <div className="text-center text-sm">
                <span className="text-gray-500">Chưa nhận được mã? </span>
                {isResendDisabled ? (
                  <span className="text-gray-400 font-medium">
                    Gửi lại sau {countdown}s
                  </span>
                ) : (
                  <button
                    onClick={handleResend}
                    className="font-semibold text-purple-600 hover:text-purple-500 underline focus:outline-none"
                  >
                    Gửi lại mã
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default OTPVerification;
