import type { SVGProps } from "react";

/** The YC wordmark in Stack Sans Notch (OFL); it keeps the upstream name so every place that shows the product mark follows it. */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="20 -716 1301 732" xmlns="http://www.w3.org/2000/svg">
      <g transform="scale(1 -1)" fill="currentColor">
        <path d="M260 192 20 700H168L333 339H295L459 700H607L367 192ZM241 349H386V0H241Z" />
        <path
          transform="translate(627 0)"
          d="M694 285Q687 195 648.5 127.0Q610 59 541.5 21.5Q473 -16 374 -16Q263 -16 185.5 33.5Q108 83 68.0 166.0Q28 249 28 351Q28 426 50.5 492.5Q73 559 117.0 609.0Q161 659 225.5 687.5Q290 716 374 716Q515 716 594.5 641.5Q674 567 690 441H536Q531 475 519.0 501.5Q507 528 487.5 546.5Q468 565 440.0 574.5Q412 584 374 584Q306 584 262.5 550.5Q219 517 199.0 463.5Q179 410 179 351Q179 291 199.0 237.5Q219 184 262.5 150.0Q306 116 374 116Q416 116 446.0 128.0Q476 140 496.5 162.0Q517 184 528.0 215.0Q539 246 542 285Z"
        />
      </g>
    </svg>
  );
}
