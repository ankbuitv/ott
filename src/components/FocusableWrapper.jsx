import React, { useEffect } from 'react';
import { useFocusable } from '@noriginmedia/react-spatial-navigation';

/**
 * FocusableWrapper - Thành phần bọc hỗ trợ Spatial Navigation cho D-pad Remote
 * Tác giả: CHRTV OTT Full-stack Architect
 */
export default function FocusableWrapper({
  children,
  onEnterPress,
  onFocus,
  onBlur,
  focusKey: customFocusKey,
  className = '',
  activeClassName = 'tv-focused border-2 border-red-600 bg-red-600/30 shadow-lg shadow-red-600/50 scale-105',
  inactiveClassName = '',
  onClick,
  autoFocus = false,
  extraProps = {},
}) {
  const { ref, focused, focusSelf, setFocus } = useFocusable({
    focusKey: customFocusKey,
    onEnterPress: (details) => {
      if (onEnterPress) onEnterPress(details);
      if (onClick) onClick(details);
    },
    onFocus: (details) => {
      if (onFocus) onFocus(details);
    },
    onBlur: (details) => {
      if (onBlur) onBlur(details);
    },
    extraProps,
  });

  useEffect(() => {
    if (autoFocus && focusSelf) {
      focusSelf();
    }
  }, [autoFocus, focusSelf]);

  return (
    <div
      ref={ref}
      onClick={(e) => {
        if (setFocus) setFocus();
        if (onClick) onClick(e);
      }}
      className={`cursor-pointer transition-all duration-200 outline-none rounded-lg ${className} ${
        focused ? activeClassName : inactiveClassName
      }`}
    >
      {typeof children === 'function' ? children({ focused }) : children}
    </div>
  );
}
