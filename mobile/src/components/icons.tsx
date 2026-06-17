import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from "react-native-svg";

export type IconProps = {
  size?: number;
  color?: string;
  fill?: string;
};

const strokeProps = {
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 2
};

const outlineProps = {
  ...strokeProps,
  fill: "none"
};

export function AlertCircle({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" stroke={color} {...outlineProps} />
      <Line x1="12" y1="8" x2="12" y2="12" stroke={color} {...outlineProps} />
      <Line x1="12" y1="16" x2="12.01" y2="16" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function Check({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6 9 17l-5-5" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function ChevronLeft({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polyline points="15 18 9 12 15 6" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function ListMusic({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="8" y1="6" x2="21" y2="6" stroke={color} {...outlineProps} />
      <Line x1="8" y1="12" x2="17" y2="12" stroke={color} {...outlineProps} />
      <Line x1="8" y1="18" x2="14" y2="18" stroke={color} {...outlineProps} />
      <Circle cx="3.5" cy="6" r="1.5" stroke={color} {...outlineProps} />
      <Circle cx="3.5" cy="12" r="1.5" stroke={color} {...outlineProps} />
      <Circle cx="3.5" cy="18" r="1.5" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function Mic({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="9" y="2" width="6" height="12" rx="3" stroke={color} {...outlineProps} />
      <Path d="M5 10a7 7 0 0 0 14 0" stroke={color} {...outlineProps} />
      <Line x1="12" y1="17" x2="12" y2="22" stroke={color} {...outlineProps} />
      <Line x1="8" y1="22" x2="16" y2="22" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function Play({ size = 24, color = "currentColor", fill = "none" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="8 5 19 12 8 19 8 5" stroke={color} fill={fill} {...strokeProps} />
    </Svg>
  );
}

export function Plus({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="12" y1="5" x2="12" y2="19" stroke={color} {...outlineProps} />
      <Line x1="5" y1="12" x2="19" y2="12" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function RotateCcw({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 12a9 9 0 1 0 3-6.7" stroke={color} {...outlineProps} />
      <Polyline points="3 4 3 10 9 10" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function Search({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="11" cy="11" r="8" stroke={color} {...outlineProps} />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function Square({ size = 24, color = "currentColor", fill = "none" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="6" y="6" width="12" height="12" rx="1" stroke={color} fill={fill} {...strokeProps} />
    </Svg>
  );
}

export function Tag({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8Z" stroke={color} {...outlineProps} />
      <Circle cx="7.5" cy="7.5" r="1.5" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function Trash2({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6h18" stroke={color} {...outlineProps} />
      <Path d="M8 6V4h8v2" stroke={color} {...outlineProps} />
      <Path d="M6 6l1 15h10l1-15" stroke={color} {...outlineProps} />
      <Line x1="10" y1="11" x2="10" y2="17" stroke={color} {...outlineProps} />
      <Line x1="14" y1="11" x2="14" y2="17" stroke={color} {...outlineProps} />
    </Svg>
  );
}

export function X({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} {...outlineProps} />
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} {...outlineProps} />
    </Svg>
  );
}
