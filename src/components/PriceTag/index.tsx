import { Tag } from 'antd';

interface Props {
  value: number | string;
  prefix?: string;
  suffix?: string;
  size?: 'small' | 'default';
  variant?: 'solid' | 'light';
}

export default function PriceTag({
  value,
  prefix = '¥',
  suffix,
  size = 'default',
  variant = 'light',
}: Props) {
  const display =
    typeof value === 'number'
      ? Number(value.toFixed(2)).toString()
      : String(value ?? '');
  if (variant === 'solid') {
    return (
      <Tag color="orange" style={{ fontSize: size === 'small' ? 12 : 14, padding: '2px 10px' }}>
        {prefix}
        {display}
        {suffix ? ` ${suffix}` : ''}
      </Tag>
    );
  }
  return (
    <span className="price-tag" style={{ fontSize: size === 'small' ? 13 : 16 }}>
      {prefix}
      {display}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}
