file(GLOB SHADER_FILES
    "${CMAKE_CURRENT_SOURCE_DIR}/*.vs"
    "${CMAKE_CURRENT_SOURCE_DIR}/*.fs"
)

set(TEXTURE_FILES
    container.png
    container_specular.png
)

add_executable(
    12_directional_light
    directional.cpp
    ${GLAD_SOURCE}
)

add_executable(
    12_point_light
    point_cube.cpp
    ${GLAD_SOURCE}
)

add_executable(
    12_spot_light
    spot_cube.cpp
    ${GLAD_SOURCE}
)

if(WIN32)
    target_link_libraries(12_directional_light glfw opengl32)
    target_link_libraries(12_point_light glfw opengl32)
    target_link_libraries(12_spot_light glfw opengl32)
endif()

set(LIGHT_TARGETS
    12_directional_light
    12_point_light
    12_spot_light
)

foreach(TARGET_NAME ${LIGHT_TARGETS})

    foreach(SHADER ${SHADER_FILES})

        get_filename_component(
            SHADER_NAME
            ${SHADER}
            NAME
        )

        add_custom_command(
            TARGET ${TARGET_NAME}
            POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${SHADER}
            "$<TARGET_FILE_DIR:${TARGET_NAME}>/${SHADER_NAME}"
        )

    endforeach()

endforeach()

foreach(TARGET_NAME ${LIGHT_TARGETS})

    foreach(IMG_FILE ${TEXTURE_FILES})

        add_custom_command(
            TARGET ${TARGET_NAME}
            POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
            "$<TARGET_FILE_DIR:${TARGET_NAME}>/${IMG_FILE}"
        )

    endforeach()

endforeach()