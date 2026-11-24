import { actualNodeDiameter, markerLength, nodeDiameter } from '../../common/constants';
import { getPointerStartEndCoordinates } from '../../common/helpers';

const BASE_FONT_SIZE = 24;
const INNER_LABEL_WIDTH = nodeDiameter - 10;
const CHAR_WIDTH_RATIO = 0.65;

/** Scales node labels above two characters so any signed 32-bit value fits inside the node circle. */
export const listNodeFontSize = (value: number): string => {
  const chars = String(value).length;
  if (chars <= 2) return String(BASE_FONT_SIZE);
  return String(
    Math.min(BASE_FONT_SIZE, Number((INNER_LABEL_WIDTH / (chars * CHAR_WIDTH_RATIO)).toFixed(1)))
  );
};

export enum Style {
  STRAIGHT,
  CURVED,
}

export const getPointerPath = (
  startCentreX: number,
  startCentreY: number,
  endCentreX: number,
  endCentreY: number,
  style: Style = Style.STRAIGHT
) => {
  const [[startX, startY], [endX, endY]] = getPointerStartEndCoordinates(
    startCentreX,
    startCentreY,
    endCentreX,
    endCentreY
  );
  return style === Style.CURVED
    ? `M ${startX - actualNodeDiameter / 2 + (actualNodeDiameter / 2) * Math.cos(Math.PI / 4)},${
        startY - (actualNodeDiameter / 2) * Math.sin(Math.PI / 4)
      } Q ${(startX + endX) / 2 + markerLength / 4},-30 ${
        endX +
        (actualNodeDiameter + markerLength) / 2 +
        -((actualNodeDiameter + markerLength) / 2) * Math.cos(Math.PI / 4)
      },${endY - ((actualNodeDiameter + markerLength) / 2) * Math.sin(Math.PI / 4)}`
    : `M ${startX},${startY} Q ${(startX + endX) / 2},${(startY + endY) / 2} ${endX},${endY}`;
};
