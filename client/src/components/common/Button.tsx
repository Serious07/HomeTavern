import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  ...props
}) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition';
  const variantClasses =
    variant === 'primary'
      ? 'bg-blue-600 hover:bg-blue-700'
      : 'bg-gray-700 hover:bg-gray-600';

  return (
    <button
      className={`${baseClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
