import React, { Component } from 'react';
import { withFocusable } from '@noriginmedia/react-spatial-navigation';

const DEFAULT_ACTIVE_CLASS =
  'tv-focused border-2 border-[#f36f21] bg-[#f36f21]/30 shadow-lg shadow-[#f36f21]/50 scale-105';

/**
 * FocusableElement - Component nội bộ nhận các props do withFocusable HOC inject vào
 * (focused, setFocus, stealFocus, ...) và render ra DOM node focusable.
 * Lưu ý: @noriginmedia/react-spatial-navigation@2.12.9 KHÔNG có hook `useFocusable`
 * (hook chỉ tồn tại từ v3 / gói khác). Import `useFocusable` sẽ trả về `undefined`
 * và gọi nó khi render làm toàn bộ React tree crash -> màn hình đen trống trơn.
 * Vì vậy phiên bản 2.x phải dùng HOC `withFocusable`.
 */
class FocusableElement extends Component {
  componentDidMount() {
    const { autoFocus, setFocus } = this.props;
    if (autoFocus && setFocus) {
      setFocus();
    }
  }

  render() {
    const {
      children,
      focused,
      setFocus,
      onClick,
      className = '',
      activeClassName = DEFAULT_ACTIVE_CLASS,
      inactiveClassName = '',
    } = this.props;

    return (
      <div
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
}

const FocusableElementHOC = withFocusable()(FocusableElement);

/**
 * FocusableWrapper - Thành phần bọc hỗ trợ Spatial Navigation cho D-pad Remote.
 * Giữ nguyên giao diện (props) cũ: children, onClick, onEnterPress, onFocus,
 * onBlur, focusKey, className, activeClassName, inactiveClassName, autoFocus.
 * Ở bản 2.x, callback focus/blur là onBecameFocused/onBecameBlurred và nhấn OK
 * trên remote là onEnterPress, nên cần map sang đúng API của thư viện.
 */
export default function FocusableWrapper(props) {
  const { onEnterPress, onFocus, onBlur, onClick, ...rest } = props;

  return (
    <FocusableElementHOC
      {...rest}
      onClick={onClick}
      onEnterPress={(innerRest, details) => {
        if (onEnterPress) onEnterPress(details);
        if (onClick) onClick(details);
      }}
      onBecameFocused={(layout, innerRest, details) => {
        if (onFocus) onFocus(details);
      }}
      onBecameBlurred={(layout, innerRest, details) => {
        if (onBlur) onBlur(details);
      }}
    />
  );
}
