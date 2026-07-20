#version 330 core
out vec4 FragColor;

in VS_OUT {
    vec3 FragPos;
    vec3 Normal;
    vec2 TexCoords;
} fs_in;

struct Light {
    vec3 Position;
    vec3 Color;
};

uniform Light lights[4];
uniform sampler2D diffuseTexture;
uniform vec3 viewPos;

void main()
{
    vec3 color = texture(diffuseTexture, fs_in.TexCoords).rgb;
    vec3 normal = normalize(fs_in.Normal);

    vec3 ambient = 0.f * color;
    vec3 lighting = vec3(0.f);
    for(int i = 0; i<4; i++)
    {
        vec3 lightDir = normalize(lights[i].Position - fs_in.FragPos);
        float diff = max(dot(lightDir, normal), 0.f);
        vec3 diffuse = lights[i].Color * diff * color;
        vec3 result = diffuse;

        float distance = length(fs_in.FragPos - viewPos);
        result *= 1.f / (distance * distance);
        lighting += result;
    }
    FragColor = vec4(ambient + lighting, 1.f);
}