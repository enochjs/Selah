import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors as c, fonts } from "./theme";
import { Txt } from "./ui";

function BrandMark({ size = 31 }: { size?: number }) {
  return (
    <Svg width={size} height={(size * 36) / 31} viewBox="0 0 31 36">
      <Path
        d="M15.5 32V8M15.5 22C5 23 2 17 3 9c8 0 13 4 12.5 13ZM15.5 16C26 17 29 10 28 3c-8 0-13 4-12.5 13Z"
        stroke={c.green}
        strokeWidth={1.65}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
      <View
        style={{
          width: 36,
          height: 39,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BrandMark />
      </View>
      <View>
        <Txt
          style={{
            fontFamily: fonts.serif,
            fontSize: small ? 23 : 28,
            letterSpacing: -0.7,
          }}
        >
          selah<Txt style={{ fontSize: 12, color: c.muted }}> 息语</Txt>
        </Txt>
        {!small && (
          <Txt
            style={{
              fontSize: 7,
              letterSpacing: 1.6,
              color: c.muted,
              marginTop: 2,
            }}
          >
            A MOMENT WITH THE WORD
          </Txt>
        )}
      </View>
    </View>
  );
}

export function ReaderBrand({ showName }: { showName: boolean }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="selah"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
      }}
    >
      <BrandMark size={20} />
      {showName && (
        <Txt
          style={{
            fontFamily: fonts.serif,
            fontSize: 18,
            color: c.green,
            letterSpacing: -0.4,
          }}
        >
          selah
        </Txt>
      )}
    </View>
  );
}
